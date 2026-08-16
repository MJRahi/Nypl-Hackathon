import type { BuildingReport } from '@/lib/types';
import { aggregateReport } from '@/lib/nyc/aggregate';
import {
  fetchBuildingDatasets,
  fetchRegistration,
  parseBbl,
  type BuildingKey,
} from '@/lib/nyc/datasets';
import {
  CircuitOpenError,
  RateLimitedError,
  resolveReport,
  type ResolvedReport,
} from '@/lib/nyc/cache';

/** Thrown when a BBL is well-formed but matches nothing in the city's records. */
export class BuildingNotFoundError extends Error {
  constructor(bbl: string) {
    super(`No NYC records found for BBL ${bbl}`);
    this.name = 'BuildingNotFoundError';
  }
}

const BOROUGH_BY_PLUTO_CODE: Record<string, string> = {
  MN: 'Manhattan',
  BX: 'Bronx',
  BK: 'Brooklyn',
  QN: 'Queens',
  SI: 'Staten Island',
};

const BOROUGH_BY_BBL_PREFIX: Record<string, string> = {
  '1': 'Manhattan',
  '2': 'Bronx',
  '3': 'Brooklyn',
  '4': 'Queens',
  '5': 'Staten Island',
};

function titleCaseAddress(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .trim();
}

function toNumber(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Build a report from a BBL alone.
 *
 * The route contract is ?bbl= only, so address and coordinates have to come
 * from the data rather than from the geocoder. PLUTO carries address, borough,
 * zip and lat/lng for every tax lot; when PLUTO misses, the HPD complaint and
 * bedbug rows are used as fallbacks before giving up on coordinates.
 */
export async function loadBuildingReport(bbl: string, asOf = new Date()): Promise<BuildingReport> {
  const parsed = parseBbl(bbl);
  if (!parsed) throw new BuildingNotFoundError(bbl);

  const key: BuildingKey = { ...parsed, bin: null };

  // DOB complaints are keyed by BIN, which the BBL alone doesn't give us.
  // One cheap lookup up front is far better than running the whole batch twice.
  let registeredBin: string | null = null;
  // This lookup precedes the batch, so it is where a rate limit first shows up —
  // and it carries the only Retry-After upstream will give us before the breaker
  // trips and every later failure becomes a timing-free circuit-open error.
  let binLookupRateLimited = false;
  let binLookupRetryAfterMs: number | null = null;
  try {
    const reg = await fetchRegistration(key);
    registeredBin = reg.registration?.bin?.trim() || null;
  } catch (cause) {
    if (cause instanceof RateLimitedError) {
      binLookupRateLimited = true;
      binLookupRetryAfterMs = cause.retryAfterMs;
    } else if (cause instanceof CircuitOpenError && cause.rateLimited) {
      binLookupRateLimited = true;
    }
    console.warn(
      '[report] BIN lookup failed; DOB complaints will be skipped:',
      cause instanceof Error ? cause.message : cause,
    );
  }

  const {
    data,
    warnings: fetchWarnings,
    allFailed,
    rateLimited: batchRateLimited,
    rateLimitRetryAfterMs: batchRetryAfterMs,
  } = await fetchBuildingDatasets({ ...key, bin: registeredBin }, asOf);

  const rateLimited = batchRateLimited || binLookupRateLimited;
  const rateLimitRetryAfterMs =
    batchRetryAfterMs !== null || binLookupRetryAfterMs !== null
      ? Math.max(batchRetryAfterMs ?? 0, binLookupRetryAfterMs ?? 0)
      : null;

  if (allFailed) {
    // Distinguish "slow down" from "broken" — the renter gets different advice.
    if (rateLimited) {
      throw new RateLimitedError(
        'NYC Open Data rate limited every request for this building',
        rateLimitRetryAfterMs,
      );
    }
    throw new Error('Every NYC Open Data request failed');
  }

  const warnings = [...fetchWarnings];
  if (rateLimited) {
    warnings.push(
      'Some figures were skipped because NYC Open Data rate limited the request; reload in a moment for the full picture.',
    );
  }
  if (!registeredBin) {
    warnings.push('No BIN could be matched for this lot; DOB complaint counts may be incomplete.');
  }

  const pluto = data.pluto?.lot;

  // "Not found" is a claim about the city's records, so we may only make it when
  // the datasets that carry those records actually answered. If every one of them
  // failed we know nothing about this lot, and saying NOT_FOUND would tell the
  // renter the building doesn't exist when really we just couldn't reach the city.
  const answered = [data.pluto, data.hpdComplaints, data.hpdViolations, data.registration];
  if (answered.every((dataset) => dataset === null)) {
    if (rateLimited) {
      throw new RateLimitedError(
        'NYC Open Data rate limited every lookup for this building',
        rateLimitRetryAfterMs,
      );
    }
    throw new Error('Every NYC Open Data lookup failed for this building');
  }

  const hasAnyRecord =
    Boolean(pluto) ||
    (data.hpdComplaints?.totalAllTime ?? 0) > 0 ||
    (data.hpdViolations?.openTotal ?? 0) + (data.hpdViolations?.closedTotal ?? 0) > 0 ||
    Boolean(data.registration?.registration);

  if (!hasAnyRecord) throw new BuildingNotFoundError(bbl);

  const rawAddress = pluto?.address?.trim();
  const borough =
    BOROUGH_BY_PLUTO_CODE[(pluto?.borough ?? '').trim().toUpperCase()] ??
    BOROUGH_BY_BBL_PREFIX[bbl[0]] ??
    '';

  const zip = pluto?.zipcode?.trim();
  const address = rawAddress
    ? `${titleCaseAddress(rawAddress)}, ${borough}, NY${zip ? ` ${zip}` : ''}`
    : `BBL ${bbl}, ${borough}`;

  // PLUTO covers every tax lot in the city, so it is the only coordinate
  // source worth consulting; a miss here means the lot itself is unusual.
  const lat = toNumber(pluto?.latitude) ?? 0;
  const lng = toNumber(pluto?.longitude) ?? 0;

  if (lat === 0 || lng === 0) {
    warnings.push('Map coordinates are unavailable for this lot.');
  }
  if (!rawAddress) {
    warnings.push('No PLUTO record for this lot; the street address could not be confirmed.');
  }

  return aggregateReport({
    address,
    bbl,
    bin: registeredBin,
    borough,
    lat,
    lng,
    data,
    warnings,
    asOf,
  });
}

/**
 * Public entry point for the route and the warm-cache script: demo file, then
 * cache, then in-flight dedupe, then a live pipeline run.
 */
export function getBuildingReport(bbl: string): Promise<ResolvedReport> {
  return resolveReport(bbl, () => loadBuildingReport(bbl));
}
