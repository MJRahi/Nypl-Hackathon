import type { BuildingReport } from '@/lib/types';
import { aggregateReport } from '@/lib/nyc/aggregate';
import {
  fetchBuildingDatasets,
  fetchRegistration,
  parseBbl,
  type BuildingKey,
} from '@/lib/nyc/datasets';
import { resolveReport, type ResolvedReport } from '@/lib/nyc/cache';

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
  try {
    const reg = await fetchRegistration(key);
    registeredBin = reg.registration?.bin?.trim() || null;
  } catch (cause) {
    console.warn(
      '[report] BIN lookup failed; DOB complaints will be skipped:',
      cause instanceof Error ? cause.message : cause,
    );
  }

  const { data, warnings: fetchWarnings, allFailed } = await fetchBuildingDatasets(
    { ...key, bin: registeredBin },
    asOf,
  );

  if (allFailed) throw new Error('Every NYC Open Data request failed');

  const warnings = [...fetchWarnings];
  if (!registeredBin) {
    warnings.push('No BIN could be matched for this lot; DOB complaint counts may be incomplete.');
  }

  const pluto = data.pluto?.lot;

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
