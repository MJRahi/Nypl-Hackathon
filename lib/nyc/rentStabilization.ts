/**
 * Rent stabilization signal — deliberately outside the frozen BuildingReport
 * contract in lib/types.ts, and outside the Walkthrough score.
 *
 * No public dataset says "apartment 4B is rent stabilized". DHCR holds the
 * authoritative registration and does not publish it as an API, so the honest
 * ceiling for this feature is "this building may contain stabilized units".
 * Everything below is written to stay under that ceiling: the verdict is either
 * a qualified maybe or an explicit non-answer, never a confirmation.
 *
 * Two independent signals, both requiring 6+ residential units because that is
 * the coverage threshold in the Rent Stabilization Law:
 *
 *   1. Pre-1974 construction. Buildings of 6+ units put up before Jan 1 1974
 *      are the core of the stabilized stock (ETPA / NYC Admin Code § 26-504).
 *   2. An active 421-a or J-51 tax benefit. These carry stabilization for the
 *      life of the benefit regardless of when the building went up, which is
 *      the main reason a post-1974 building would be covered.
 *
 * Erring toward "not confirmed" is the safe direction: under-claiming sends a
 * renter to check DHCR, over-claiming sends them into a lease believing they
 * have protections they may not have.
 */

import { socrataQuery, datasetUrl, parseBbl } from '@/lib/nyc/datasets';

/** Buildings first occupied on or after this date fall outside the pre-1974 rule. */
const STABILIZATION_ERA_CUTOFF_YEAR = 1974;

/** The Rent Stabilization Law covers buildings of six or more units. */
const MIN_COVERED_UNITS = 6;

const DATASETS = {
  pluto: { id: '64uk-42ks', name: 'Primary Land Use Tax Lot Output (PLUTO)' },
  exemptions: { id: 'muvi-b6kx', name: 'DOF Property Exemption Detail' },
} as const;

/**
 * DOF exemption codes, checked against the live dataset rather than taken from
 * documentation.
 *
 * J-51 identifies itself: 1920 is the only code that ever carries a non-zero
 * j51_base_val_act, so that column confirms the program rather than the code
 * mapping having to be trusted.
 *
 * The 51xx block is the housing-development family — 421-a sits in it, but so
 * do Article XI and HDFC benefits with terms as short as six years, and the
 * codes do not separate cleanly enough to name a specific program. These are
 * treated as one unnamed signal: a benefit of this kind usually carries a
 * regulatory agreement, and saying that much is defensible where naming 421-a
 * would not be. 5112 is excluded because its rows are overwhelmingly class
 * A/B/C0 one-to-three family homes, which carry no stabilization at all.
 */
const J51_CODE = '1920';
const HOUSING_BENEFIT_CODES: ReadonlySet<string> = new Set([
  '5110',
  '5111',
  '5113',
  '5114',
  '5116',
  '5117',
  '5118',
  '5121',
  '5129',
  '5130',
]);

/** How far back an exemption record is still worth reading. */
const EXEMPTION_LOOKBACK_YEARS = 2;

export type RentRegulationVerdict = 'possible' | 'unconfirmed';

export interface RentRegulationSource {
  name: string;
  datasetId: string;
  url: string;
}

export interface RentRegulationSignal {
  bbl: string;
  verdict: RentRegulationVerdict;
  unitCount: number | null;
  yearBuilt: number | null;
  /** Why the verdict came out this way, in renter-readable phrases. */
  reasons: string[];
  sources: RentRegulationSource[];
  checkedAt: string;
}

interface PlutoLotRow {
  unitsres?: string;
  unitstotal?: string;
  yearbuilt?: string;
  bldgclass?: string;
}

interface ExemptionRow {
  exmp_code?: string;
  year?: string;
  j51_base_val_act?: string;
  /** Leading-plus year the benefit began, e.g. "+2019". */
  benftstart?: string;
  /** Benefit term in years. */
  no_years?: string;
}

function toPositiveInt(raw: unknown): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.trunc(value);
}

function sourceFor(dataset: { id: string; name: string }): RentRegulationSource {
  return { name: dataset.name, datasetId: dataset.id, url: datasetUrl(dataset.id) };
}

/**
 * PLUTO is queried directly here rather than reused from the report pipeline so
 * this feature has no coupling to the building report and cannot break it.
 */
async function fetchLot(bbl: string): Promise<PlutoLotRow | null> {
  const rows = await socrataQuery<PlutoLotRow>(DATASETS.pluto.id, {
    // bbl is a numeric column in PLUTO, so it is compared unquoted.
    $where: `bbl=${bbl}`,
    $select: 'unitsres, unitstotal, yearbuilt, bldgclass',
    $limit: '1',
  });
  return rows[0] ?? null;
}

/** 'J-51' when the dataset confirms that program, 'housing' when it only shows the family. */
type TaxBenefitKind = 'J-51' | 'housing';

/** "+2019" -> 2019. */
function parseBenefitStart(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  return toPositiveInt(raw.replace('+', ''));
}

/**
 * A benefit still running this year, per its own start year and term. Records
 * missing either field are kept: the row exists in a recent assessment year,
 * which is already evidence of a live benefit.
 */
function isRunning(row: ExemptionRow, thisYear: number): boolean {
  const start = parseBenefitStart(row.benftstart);
  const term = toPositiveInt(row.no_years);
  if (start === null || term === null) return true;
  return start + term >= thisYear;
}

/**
 * The most specific benefit on the lot. J-51 wins over the unnamed family when
 * both are present, because it is the one we can actually name.
 */
async function fetchTaxBenefit(bbl: string): Promise<TaxBenefitKind | null> {
  const thisYear = new Date().getUTCFullYear();
  const rows = await socrataQuery<ExemptionRow>(DATASETS.exemptions.id, {
    // year is stored as text; four-digit years compare correctly as strings.
    $where: `parid='${bbl}' AND year >= '${thisYear - EXEMPTION_LOOKBACK_YEARS}'`,
    $select: 'exmp_code, year, j51_base_val_act, benftstart, no_years',
    $order: 'year DESC',
    $limit: '50',
  });

  let housing = false;

  for (const row of rows) {
    if (!isRunning(row, thisYear)) continue;

    const code = row.exmp_code?.trim() ?? '';
    const j51Value = Number(row.j51_base_val_act);
    if (code === J51_CODE || (Number.isFinite(j51Value) && j51Value > 0)) return 'J-51';
    if (HOUSING_BENEFIT_CODES.has(code)) housing = true;
  }

  return housing ? 'housing' : null;
}

function unconfirmed(bbl: string, reasons: string[], sources: RentRegulationSource[]): RentRegulationSignal {
  return {
    bbl,
    verdict: 'unconfirmed',
    unitCount: null,
    yearBuilt: null,
    reasons,
    sources,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Resolve the signal for a BBL.
 *
 * Never throws on upstream failure. A lookup that cannot complete produces the
 * same 'unconfirmed' verdict as a lookup that completes and finds nothing —
 * both are honestly described to the renter as "we couldn't confirm this", and
 * neither is allowed to take the building report down with it.
 */
export async function getRentRegulationSignal(bbl: string): Promise<RentRegulationSignal> {
  const key = parseBbl(bbl);
  if (!key) return unconfirmed(bbl, [], []);

  const sources: RentRegulationSource[] = [sourceFor(DATASETS.pluto)];

  let lot: PlutoLotRow | null = null;
  try {
    lot = await fetchLot(key.bbl);
  } catch (cause) {
    console.warn(
      `[rent-regulation] PLUTO lookup failed for ${key.bbl}:`,
      cause instanceof Error ? cause.message : cause,
    );
    return unconfirmed(key.bbl, [], sources);
  }

  const unitCount = toPositiveInt(lot?.unitsres) ?? toPositiveInt(lot?.unitstotal);
  const yearBuilt = toPositiveInt(lot?.yearbuilt);
  const coveredSize = unitCount !== null && unitCount >= MIN_COVERED_UNITS;

  // The tax-benefit lookup only changes the answer for a building large enough
  // to be covered, so a small lot skips the request entirely.
  let benefit: TaxBenefitKind | null = null;
  if (coveredSize) {
    try {
      benefit = await fetchTaxBenefit(key.bbl);
      sources.push(sourceFor(DATASETS.exemptions));
    } catch (cause) {
      // Degrades to the pre-1974 signal alone rather than failing the check.
      console.warn(
        `[rent-regulation] exemption lookup failed for ${key.bbl}:`,
        cause instanceof Error ? cause.message : cause,
      );
    }
  }

  const preCutoff = yearBuilt !== null && yearBuilt < STABILIZATION_ERA_CUTOFF_YEAR;
  const reasons: string[] = [];

  if (coveredSize && preCutoff) {
    reasons.push(
      `${unitCount} units and built in ${yearBuilt}, before the 1974 cutoff that covers most rent-stabilized buildings.`,
    );
  }

  if (coveredSize && benefit) {
    reasons.push(
      benefit === 'J-51'
        ? 'The lot carries a J-51 tax benefit, which normally requires rent stabilization for as long as the benefit runs.'
        : 'The lot carries a city housing tax benefit. Benefits of this kind usually come with a regulatory agreement that limits rents.',
    );
  }

  if (reasons.length === 0) {
    return {
      bbl: key.bbl,
      verdict: 'unconfirmed',
      unitCount,
      yearBuilt,
      reasons: [],
      sources,
      checkedAt: new Date().toISOString(),
    };
  }

  return {
    bbl: key.bbl,
    verdict: 'possible',
    unitCount,
    yearBuilt,
    reasons,
    sources,
    checkedAt: new Date().toISOString(),
  };
}
