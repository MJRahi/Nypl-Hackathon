import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { RecordDetail } from '@/lib/types';
import { buildRecords, cutoffDateString } from '@/lib/nyc/aggregate';
import { fetchBuildingDatasets, fetchRegistration, parseBbl, type BuildingKey } from '@/lib/nyc/datasets';
import { CircuitOpenError, RateLimitedError } from '@/lib/nyc/cache';
import { BuildingNotFoundError } from '@/lib/nyc/report';

/**
 * Record-level detail for the drill-down drawer. Deliberately NOT part of
 * BuildingReport / /api/building — some buildings have 1000+ records, so
 * this is its own on-demand fetch, only made when a drawer actually opens.
 *
 * This independently re-fetches the same raw datasets loadBuildingReport
 * already fetched for the main report. That's a deliberate v1 scope cut,
 * not an oversight: sharing a raw-dataset cache between the two paths is
 * real additional work, and the existing resilience (circuit breaker,
 * RateLimitedError -> RATE_LIMITED) already covers the failure mode this
 * would otherwise avoid.
 */

const DEMO_DIR = path.join(process.cwd(), 'public', 'demo');

function isSafeBbl(bbl: string): boolean {
  return /^[1-5]\d{9}$/.test(bbl);
}

/** Checked before any live fetch — a committed fixture means the demo drawer opens with the wifi unplugged. */
export async function readDemoRecords(bbl: string): Promise<RecordDetail[] | null> {
  if (!isSafeBbl(bbl)) return null;
  try {
    const raw = await readFile(path.join(DEMO_DIR, `${bbl}.records.json`), 'utf8');
    return JSON.parse(raw) as RecordDetail[];
  } catch {
    return null;
  }
}

/** Live pipeline: parse the BBL, resolve the BIN, fetch the same four datasets, build records. */
export async function loadBuildingRecords(bbl: string, asOf = new Date()): Promise<RecordDetail[]> {
  const parsed = parseBbl(bbl);
  if (!parsed) throw new BuildingNotFoundError(bbl);

  const key: BuildingKey = { ...parsed, bin: null };

  let registeredBin: string | null = null;
  try {
    const reg = await fetchRegistration(key);
    registeredBin = reg.registration?.bin?.trim() || null;
  } catch (cause) {
    if (cause instanceof RateLimitedError || (cause instanceof CircuitOpenError && cause.rateLimited)) {
      throw cause;
    }
    // Non-fatal: DOB complaints are simply skipped without a BIN, same as the main report.
    console.warn(
      '[records] BIN lookup failed; DOB complaints will be skipped:',
      cause instanceof Error ? cause.message : cause,
    );
  }

  const { data, allFailed, rateLimited, rateLimitRetryAfterMs } = await fetchBuildingDatasets(
    { ...key, bin: registeredBin },
    asOf,
  );

  if (allFailed) {
    if (rateLimited) {
      throw new RateLimitedError(
        'NYC Open Data rate limited every request for this building',
        rateLimitRetryAfterMs,
      );
    }
    throw new Error('Every NYC Open Data request failed');
  }

  const cutoff24 = cutoffDateString(asOf, 2);
  return buildRecords(data, cutoff24);
}

/** Demo fixture first, then the live pipeline — no separate cache layer in v1. */
export async function getBuildingRecords(bbl: string): Promise<RecordDetail[]> {
  const demo = await readDemoRecords(bbl);
  if (demo) return demo;
  return loadBuildingRecords(bbl);
}
