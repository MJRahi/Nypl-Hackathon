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

export class CircuitOpenError extends Error {
  constructor(msRemaining: number) {
    super(`circuit open, retrying in ${Math.ceil(msRemaining / 1000)}s`);
    this.name = 'CircuitOpenError';
  }
}

/**
 * Trips after 5 consecutive failures and stops all calls for 60s. Any single
 * success resets the count — the threshold is about a sustained outage, not a
 * tally of unrelated blips.
 */
class CircuitBreaker {
  private consecutiveFailures = 0;
  private openedAt: number | null = null;

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
  }

  recordFailure(): void {
    this.consecutiveFailures += 1;
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
  if (remaining > 0) throw new CircuitOpenError(remaining);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(url, init);

      if (!isRetryableStatus(response.status)) {
        socrataBreaker.recordSuccess();
        return response;
      }

      lastError = new Error(`HTTP ${response.status}`);
      socrataBreaker.recordFailure();
    } catch (cause) {
      lastError = cause instanceof Error ? cause : new Error('unknown fetch error');
      socrataBreaker.recordFailure();
      // An aborted request is a timeout we already waited on; treat like 5xx.
    }

    const isLastAttempt = attempt === RETRY_DELAYS_MS.length - 1;
    if (isLastAttempt) break;

    if (socrataBreaker.isOpen) {
      throw new CircuitOpenError(socrataBreaker.msUntilClose());
    }

    await sleep(jittered(RETRY_DELAYS_MS[attempt]));
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

interface CacheEnvelope {
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
    const envelope: CacheEnvelope = { cachedAt: new Date().toISOString(), report };
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
