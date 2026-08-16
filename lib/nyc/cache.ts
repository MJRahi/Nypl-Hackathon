import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { BuildingReport } from '@/lib/types';

/**
 * Resilience layer for everything that touches the network.
 *
 * Order of precedence when a report is requested:
 *   1. /public/demo/{bbl}.json  — committed demo fixture, zero network calls
 *   2. file cache, < 24h old    — zero network calls
 *   3. in-flight request for the same BBL — joined, not duplicated
 *   4. live fetch through retry + circuit breaker
 *   5. stale cache + a warning  — when live fetch fails or the breaker is open
 */

const DEMO_DIR = path.join(process.cwd(), 'public', 'demo');
const CACHE_DIR = path.join(process.cwd(), '.cache', 'buildings');

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const RETRY_DELAYS_MS = [500, 1000, 2000];
const BREAKER_FAILURE_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 60_000;

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

/**
 * Upstream asked us to slow down (HTTP 429), as distinct from upstream being
 * broken. Routes surface this as RATE_LIMITED so the UI can say "try again in a
 * moment" instead of "the city's data is down" — different advice for the renter.
 */
export class RateLimitedError extends Error {
  readonly retryAfterMs: number | null;

  constructor(message: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = 'RateLimitedError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class CircuitOpenError extends Error {
  /** True when the breaker tripped on 429s rather than on errors. */
  readonly rateLimited: boolean;

  constructor(msRemaining: number, rateLimited = false) {
    super(
      `circuit open${rateLimited ? ' after rate limiting' : ''}, retrying in ${Math.ceil(msRemaining / 1000)}s`,
    );
    this.name = 'CircuitOpenError';
    this.rateLimited = rateLimited;
  }
}

/** Seconds or an HTTP date, per RFC 9110. Returns null when absent or unparseable. */
function parseRetryAfter(response: Response): number | null {
  const header = response.headers.get('retry-after');
  if (!header) return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());

  return null;
}

/**
 * Trips after 5 consecutive failures and stops all calls for 60s. Any single
 * success resets the count — the threshold is about a sustained outage, not a
 * tally of unrelated blips.
 */
class CircuitBreaker {
  private consecutiveFailures = 0;
  private openedAt: number | null = null;
  private lastFailureWasRateLimit = false;

  /** Whether the failures that tripped the breaker were rate limits. */
  get trippedByRateLimit(): boolean {
    return this.lastFailureWasRateLimit;
  }

  msUntilClose(now = Date.now()): number {
    if (this.openedAt === null) return 0;
    const remaining = BREAKER_COOLDOWN_MS - (now - this.openedAt);
    if (remaining <= 0) {
      // Cooldown elapsed: half-open, let the next call probe upstream.
      this.openedAt = null;
      this.consecutiveFailures = 0;
      return 0;
    }
    return remaining;
  }

  get isOpen(): boolean {
    return this.msUntilClose() > 0;
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.openedAt = null;
    this.lastFailureWasRateLimit = false;
  }

  recordFailure(wasRateLimit = false): void {
    this.consecutiveFailures += 1;
    this.lastFailureWasRateLimit = wasRateLimit;
    if (this.consecutiveFailures >= BREAKER_FAILURE_THRESHOLD && this.openedAt === null) {
      this.openedAt = Date.now();
      console.warn(
        `[cache] circuit breaker OPEN after ${this.consecutiveFailures} consecutive failures; pausing upstream calls for ${BREAKER_COOLDOWN_MS / 1000}s`,
      );
    }
  }

  /** Test seam. */
  reset(): void {
    this.consecutiveFailures = 0;
    this.openedAt = null;
    this.lastFailureWasRateLimit = false;
  }
}

export const socrataBreaker = new CircuitBreaker();

// ---------------------------------------------------------------------------
// Retry
// ---------------------------------------------------------------------------

function jittered(baseMs: number): number {
  // +/-25% so a burst of parallel dataset calls doesn't retry in lockstep.
  return Math.round(baseMs * (0.75 + Math.random() * 0.5));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * fetch with 3 attempts on 429/5xx and transport errors, backing off
 * 500ms / 1s / 2s with jitter, gated by the circuit breaker.
 *
 * A 4xx other than 429 is returned as-is: a bad query will not fix itself,
 * and retrying it just burns rate limit.
 */
export async function resilientFetch(
  url: URL | string,
  init: RequestInit = {},
): Promise<Response> {
  const remaining = socrataBreaker.msUntilClose();
  if (remaining > 0) {
    throw new CircuitOpenError(remaining, socrataBreaker.trippedByRateLimit);
  }

  let lastError: Error | null = null;
  let lastWasRateLimit = false;
  let retryAfterMs: number | null = null;

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(url, init);

      if (!isRetryableStatus(response.status)) {
        socrataBreaker.recordSuccess();
        return response;
      }

      lastWasRateLimit = response.status === 429;
      if (lastWasRateLimit) retryAfterMs = parseRetryAfter(response);
      lastError = new Error(`HTTP ${response.status}`);
      socrataBreaker.recordFailure(lastWasRateLimit);
    } catch (cause) {
      lastWasRateLimit = false;
      lastError = cause instanceof Error ? cause : new Error('unknown fetch error');
      socrataBreaker.recordFailure(false);
      // An aborted request is a timeout we already waited on; treat like 5xx.
    }

    const isLastAttempt = attempt === RETRY_DELAYS_MS.length - 1;
    if (isLastAttempt) break;

    if (socrataBreaker.isOpen) {
      throw new CircuitOpenError(socrataBreaker.msUntilClose(), socrataBreaker.trippedByRateLimit);
    }

    // Honour Retry-After when upstream gives one, but never wait longer than
    // the request budget allows.
    const backoff = jittered(RETRY_DELAYS_MS[attempt]);
    await sleep(retryAfterMs !== null ? Math.min(retryAfterMs, 2000) : backoff);
  }

  if (lastWasRateLimit) {
    throw new RateLimitedError('upstream returned HTTP 429 after 3 attempts', retryAfterMs);
  }

  throw lastError ?? new Error('request failed');
}

// ---------------------------------------------------------------------------
// Demo fixtures
// ---------------------------------------------------------------------------

/** BBLs are the cache key and part of a file path — never trust them raw. */
function isSafeBbl(bbl: string): boolean {
  return /^[1-5]\d{9}$/.test(bbl);
}

/**
 * Checked before anything else, always. A committed demo file means the demo
 * runs with the venue wifi unplugged.
 */
export async function readDemoReport(bbl: string): Promise<BuildingReport | null> {
  if (!isSafeBbl(bbl)) return null;
  try {
    const raw = await readFile(path.join(DEMO_DIR, `${bbl}.json`), 'utf8');
    return JSON.parse(raw) as BuildingReport;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// File cache
// ---------------------------------------------------------------------------

/**
 * Bump whenever BuildingReport gains, drops, or renames a field.
 *
 * The TTL answers "is this data still true?", which is a different question
 * from "does this data still fit the code?". An entry written before a field
 * existed stays fresh for 24h and deserializes into a shape the UI believes is
 * guaranteed — `scoreBreakdown` arriving as undefined crashed the score
 * explainer that way. A version mismatch discards the entry instead.
 */
const CACHE_SCHEMA_VERSION = 2;

interface CacheEnvelope {
  /** Absent on entries written before versioning; those are always discarded. */
  schemaVersion?: number;
  cachedAt: string;
  report: BuildingReport;
}

export interface CacheHit {
  report: BuildingReport;
  ageMs: number;
  stale: boolean;
}

export async function readCachedReport(bbl: string): Promise<CacheHit | null> {
  if (!isSafeBbl(bbl)) return null;
  try {
    const raw = await readFile(path.join(CACHE_DIR, `${bbl}.json`), 'utf8');
    const envelope = JSON.parse(raw) as CacheEnvelope;
    // Checked before the age: a wrong-shaped entry is unusable at any age, and
    // must not survive as the stale fallback either.
    if (envelope.schemaVersion !== CACHE_SCHEMA_VERSION) return null;
    const ageMs = Date.now() - new Date(envelope.cachedAt).getTime();
    if (!Number.isFinite(ageMs)) return null;
    return { report: envelope.report, ageMs, stale: ageMs > CACHE_TTL_MS };
  } catch {
    return null;
  }
}

/** Cache writes are best-effort: a read-only filesystem must not fail a report. */
export async function writeCachedReport(bbl: string, report: BuildingReport): Promise<void> {
  if (!isSafeBbl(bbl)) return;
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const envelope: CacheEnvelope = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      cachedAt: new Date().toISOString(),
      report,
    };
    await writeFile(path.join(CACHE_DIR, `${bbl}.json`), JSON.stringify(envelope), 'utf8');
  } catch (cause) {
    console.warn(`[cache] could not write ${bbl}:`, cause instanceof Error ? cause.message : cause);
  }
}

// ---------------------------------------------------------------------------
// In-flight dedupe
// ---------------------------------------------------------------------------

const inFlight = new Map<string, Promise<BuildingReport>>();

/**
 * Three renters loading the same building at once should cost one pipeline run.
 * The entry is removed in a finally so a rejection doesn't poison later calls.
 */
export function dedupe(key: string, run: () => Promise<BuildingReport>): Promise<BuildingReport> {
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = run().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

export function inFlightCount(): number {
  return inFlight.size;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export type ReportSource = 'demo' | 'cache' | 'live' | 'stale';

export interface ResolvedReport {
  report: BuildingReport;
  source: ReportSource;
}

function withWarning(report: BuildingReport, warning: string): BuildingReport {
  return {
    ...report,
    dataQuality: {
      ...report.dataQuality,
      warnings: [...report.dataQuality.warnings, warning],
    },
  };
}

/**
 * Resolve a report through the full guardrail chain. `load` is only ever
 * called when steps 1-3 miss, and its failure degrades to stale cache rather
 * than propagating, whenever a stale copy exists.
 */
export async function resolveReport(
  bbl: string,
  load: () => Promise<BuildingReport>,
): Promise<ResolvedReport> {
  const demo = await readDemoReport(bbl);
  if (demo) return { report: demo, source: 'demo' };

  const cached = await readCachedReport(bbl);
  if (cached && !cached.stale) return { report: cached.report, source: 'cache' };

  // The breaker is checked before joining in-flight work so an open circuit
  // serves stale immediately instead of queueing behind a doomed request.
  if (socrataBreaker.isOpen && cached) {
    return {
      report: withWarning(
        cached.report,
        'NYC Open Data is not responding; showing the most recent cached figures.',
      ),
      source: 'stale',
    };
  }

  try {
    const report = await dedupe(bbl, async () => {
      const fresh = await load();
      await writeCachedReport(bbl, fresh);
      return fresh;
    });
    return { report, source: 'live' };
  } catch (cause) {
    if (cached) {
      const reason = cause instanceof CircuitOpenError ? 'is not responding' : 'could not be reached';
      console.warn(`[cache] serving stale report for ${bbl}:`, cause instanceof Error ? cause.message : cause);
      return {
        report: withWarning(
          cached.report,
          `NYC Open Data ${reason}; showing the most recent cached figures.`,
        ),
        source: 'stale',
      };
    }
    throw cause;
  }
}
