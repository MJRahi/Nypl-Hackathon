/**
 * Socrata fetchers for data.cityofnewyork.us.
 *
 * Every query filters server-side with $where/$select/$group/$limit/$order.
 * Counts come back as server-side aggregates, so a building with 959 complaints
 * costs us one row, not 959. Detail rows are only pulled where the report
 * actually shows them (timeline, open violations), and always bounded.
 *
 * Dataset IDs verified live on 2026-08-15 — see DATASETS for what changed.
 */

const SOCRATA_BASE = 'https://data.cityofnewyork.us/resource';
const TIMEOUT_MS = 10_000;

/** Detail-row caps. The report only ever renders 40 timeline events. */
const TIMELINE_ROW_LIMIT = 60;

/**
 * Open violations are the one place a bounded pull can distort a published
 * number: per-category openCount is derived from these rows, while
 * stats.openViolations comes from a server-side count. If the cap truncates,
 * the two disagree. 400 covers all but pathological buildings (a very bad Bronx
 * walkup runs ~120), and truncation is reported so the caller can warn rather
 * than quietly publish figures that don't add up.
 */
const OPEN_VIOLATION_LIMIT = 400;

export const DATASETS = {
  /**
   * REPLACEMENT: the specced uwyv-629c (HPD Complaints) and a2nx-4u46 (HPD
   * Complaint Problems) both return HTTP 403 "You must be logged in" — they are
   * no longer public. This single dataset supersedes both: one row per problem,
   * with complaint_id grouping problems into complaints. Count complaints with
   * count(distinct complaint_id), never count(*).
   */
  hpdComplaints: {
    id: 'ygpa-z7cr',
    name: 'Housing Maintenance Code Complaints and Problems',
  },
  hpdViolations: { id: 'wvxf-dwi5', name: 'Housing Maintenance Code Violations' },
  dobComplaints: { id: 'eabe-havv', name: 'DOB Complaints Received' },
  dobViolations: { id: '3h2n-5cm9', name: 'DOB Violations' },
  bedbug: { id: 'wz6d-d3jb', name: 'Bedbug Reporting' },
  registrations: { id: 'tesw-yqqr', name: 'Multiple Dwelling Registrations' },
  /**
   * ADDED: tesw-yqqr was specced as the unit-count source but has no unit-count
   * column at all (registrationid, boroid, block, lot, bin, dates — that's it).
   * PLUTO is the actual source for unitsres/unitstotal/yearbuilt by BBL.
   */
  pluto: { id: '64uk-42ks', name: 'Primary Land Use Tax Lot Output (PLUTO)' },
} as const;

export type DatasetKey = keyof typeof DATASETS;

export function datasetUrl(id: string): string {
  return `${SOCRATA_BASE}/${id}.json`;
}

export class SocrataError extends Error {
  readonly datasetId: string;
  readonly status: number | null;

  constructor(datasetId: string, status: number | null, message: string) {
    super(message);
    this.name = 'SocrataError';
    this.datasetId = datasetId;
    this.status = status;
  }
}

/** Identifiers a building can be queried by. Column names differ per dataset. */
export interface BuildingKey {
  bbl: string;
  bin: string | null;
  boroId: string;
  /** Unpadded, e.g. "2819". HPD datasets store block/lot this way. */
  block: string;
  lot: string;
  /** Zero-padded, e.g. "02819" / "00005". DOB BIS stores block/lot this way. */
  paddedBlock: string;
  paddedLot: string;
}

/**
 * BBL = 1 borough digit + 5-digit block + 4-digit lot.
 *
 * Padding is not cosmetic here: HPD violations store block "2819"/lot "5" while
 * DOB violations store "02819"/"00005" — and DOB is internally inconsistent,
 * carrying both "00005" and "0005" for the same lot. Queries use IN() over the
 * variants rather than betting on one.
 */
export function parseBbl(bbl: string): BuildingKey | null {
  const clean = bbl.trim();
  if (!/^[1-5]\d{9}$/.test(clean)) return null;

  const boroId = clean.slice(0, 1);
  const paddedBlock = clean.slice(1, 6);
  const paddedLot = clean.slice(6, 10);

  return {
    bbl: clean,
    bin: null,
    boroId,
    block: String(Number(paddedBlock)),
    lot: String(Number(paddedLot)),
    paddedBlock,
    paddedLot,
  };
}

function quoteList(values: readonly string[]): string {
  const unique = Array.from(new Set(values));
  return unique.map((v) => `'${v}'`).join(',');
}

/** Every request carries the app token when one is configured. */
function buildHeaders(): HeadersInit {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = process.env.SOCRATA_APP_TOKEN;
  if (token && token.trim()) headers['X-App-Token'] = token.trim();
  return headers;
}

let warnedAboutMissingToken = false;

function warnIfNoToken(): void {
  if (warnedAboutMissingToken) return;
  if (!process.env.SOCRATA_APP_TOKEN?.trim()) {
    warnedAboutMissingToken = true;
    console.warn(
      '[socrata] SOCRATA_APP_TOKEN is not set — requests run on the throttled anonymous tier.',
    );
  }
}

/**
 * One Socrata query. Throws SocrataError on any non-2xx or transport failure;
 * callers decide whether that degrades the report or fails it.
 */
export async function socrataQuery<T>(
  datasetId: string,
  params: Record<string, string>,
): Promise<T[]> {
  warnIfNoToken();

  const url = new URL(datasetUrl(datasetId));
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: buildHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : 'unknown error';
    throw new SocrataError(datasetId, null, `request failed: ${reason}`);
  }

  if (!response.ok) {
    throw new SocrataError(datasetId, response.status, `HTTP ${response.status}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new SocrataError(datasetId, response.status, 'malformed JSON response');
  }

  if (!Array.isArray(body)) {
    throw new SocrataError(datasetId, response.status, 'expected an array response');
  }

  return body as T[];
}

function toCount(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Raw row shapes — only the columns we select.
// ---------------------------------------------------------------------------

export interface HpdComplaintRow {
  complaint_id?: string;
  problem_id?: string;
  received_date?: string;
  major_category?: string;
  minor_category?: string;
  problem_code?: string;
  complaint_status?: string;
  problem_status?: string;
  space_type?: string;
  type?: string;
}

export interface HpdViolationRow {
  violationid?: string;
  class?: string;
  violationstatus?: string;
  currentstatus?: string;
  novissueddate?: string;
  novdescription?: string;
  ordernumber?: string;
  apartment?: string;
}

export interface DobComplaintRow {
  complaint_number?: string;
  status?: string;
  date_entered?: string;
  complaint_category?: string;
  disposition_code?: string;
}

export interface DobViolationRow {
  violation_number?: string;
  issue_date?: string;
  violation_type?: string;
  violation_category?: string;
  violation_type_code?: string;
  description?: string;
}

export interface BedbugRow {
  bbl?: string;
  filing_date?: string;
  infested_dwelling_unit_count?: string;
  eradicated_unit_count?: string;
  re_infested_dwelling_unit?: string;
  of_dwelling_units?: string;
}

export interface RegistrationRow {
  registrationid?: string;
  buildingid?: string;
  bin?: string;
  lastregistrationdate?: string;
  registrationenddate?: string;
}

export interface PlutoRow {
  bbl?: string;
  unitsres?: string;
  unitstotal?: string;
  yearbuilt?: string;
  address?: string;
  numfloors?: string;
}

// ---------------------------------------------------------------------------
// Per-dataset results
// ---------------------------------------------------------------------------

export interface CountByKey {
  key: string;
  count: number;
}

export interface HpdComplaintsResult {
  /** Distinct complaints, not problem rows. */
  totalAllTime: number;
  total24mo: number;
  byCategoryAllTime: CountByKey[];
  byCategory24mo: CountByKey[];
  recent: HpdComplaintRow[];
}

export interface HpdViolationsResult {
  openByClass: Record<string, number>;
  closedByClass: Record<string, number>;
  openTotal: number;
  closedTotal: number;
  open: HpdViolationRow[];
  recent: HpdViolationRow[];
  /** True when open[] hit OPEN_VIOLATION_LIMIT and per-category counts undercount. */
  openTruncated: boolean;
}

export interface DobComplaintsResult {
  total24mo: number;
  recent: DobComplaintRow[];
}

export interface DobViolationsResult {
  recent: DobViolationRow[];
}

export interface BedbugResult {
  filings: BedbugRow[];
}

export interface RegistrationResult {
  registration: RegistrationRow | null;
}

export interface PlutoResult {
  lot: PlutoRow | null;
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

/**
 * HPD complaints. Four small queries: all-time distinct total, all-time by
 * category, 24mo by category, and bounded recent rows for the timeline.
 *
 * The totals are separate queries rather than sums of the by-category rows —
 * a single complaint can carry problems in several categories, so summing the
 * per-category distinct counts would double-count it.
 */
export async function fetchHpdComplaints(
  key: BuildingKey,
  cutoffIso: string,
): Promise<HpdComplaintsResult> {
  const id = DATASETS.hpdComplaints.id;
  const where = `bbl='${key.bbl}'`;
  const where24 = `${where} AND received_date>='${cutoffIso}'`;

  const [allTime, total24, byCatAll, byCat24, recent] = await Promise.all([
    socrataQuery<{ n?: string }>(id, {
      $where: where,
      $select: 'count(distinct complaint_id) as n',
    }),
    socrataQuery<{ n?: string }>(id, {
      $where: where24,
      $select: 'count(distinct complaint_id) as n',
    }),
    socrataQuery<{ major_category?: string; n?: string }>(id, {
      $where: where,
      $select: 'major_category, count(distinct complaint_id) as n',
      $group: 'major_category',
    }),
    socrataQuery<{ major_category?: string; n?: string }>(id, {
      $where: where24,
      $select: 'major_category, count(distinct complaint_id) as n',
      $group: 'major_category',
    }),
    socrataQuery<HpdComplaintRow>(id, {
      $where: where,
      $select:
        'complaint_id, problem_id, received_date, major_category, minor_category, problem_code, complaint_status, problem_status, space_type, type',
      $order: 'received_date DESC',
      $limit: String(TIMELINE_ROW_LIMIT),
    }),
  ]);

  const mapCounts = (rows: { major_category?: string; n?: string }[]): CountByKey[] =>
    rows
      .filter((r) => typeof r.major_category === 'string')
      .map((r) => ({ key: r.major_category as string, count: toCount(r.n) }));

  return {
    totalAllTime: toCount(allTime[0]?.n),
    total24mo: toCount(total24[0]?.n),
    byCategoryAllTime: mapCounts(byCatAll),
    byCategory24mo: mapCounts(byCat24),
    recent,
  };
}

/**
 * HPD violations. Class/status counts come from one grouped query; detail rows
 * are pulled only for open violations (needed per-category) and the timeline.
 */
export async function fetchHpdViolations(key: BuildingKey): Promise<HpdViolationsResult> {
  const id = DATASETS.hpdViolations.id;
  const blocks = quoteList([key.block, key.paddedBlock]);
  const lots = quoteList([key.lot, key.paddedLot]);
  const where = `boroid='${key.boroId}' AND block in(${blocks}) AND lot in(${lots})`;

  const [grouped, open, recent] = await Promise.all([
    socrataQuery<{ class?: string; violationstatus?: string; n?: string }>(id, {
      $where: where,
      $select: 'class, violationstatus, count(*) as n',
      $group: 'class, violationstatus',
    }),
    socrataQuery<HpdViolationRow>(id, {
      $where: `${where} AND violationstatus='Open'`,
      $select:
        'violationid, class, violationstatus, currentstatus, novissueddate, novdescription, ordernumber, apartment',
      $order: 'novissueddate DESC',
      $limit: String(OPEN_VIOLATION_LIMIT),
    }),
    socrataQuery<HpdViolationRow>(id, {
      $where: where,
      $select:
        'violationid, class, violationstatus, currentstatus, novissueddate, novdescription, ordernumber, apartment',
      $order: 'novissueddate DESC',
      $limit: String(TIMELINE_ROW_LIMIT),
    }),
  ]);

  const openByClass: Record<string, number> = {};
  const closedByClass: Record<string, number> = {};
  let openTotal = 0;
  let closedTotal = 0;

  for (const row of grouped) {
    const cls = (row.class ?? '').trim().toUpperCase();
    const n = toCount(row.n);
    // violationstatus is 'Open' | 'Close'.
    if ((row.violationstatus ?? '').trim().toLowerCase() === 'open') {
      openByClass[cls] = (openByClass[cls] ?? 0) + n;
      openTotal += n;
    } else {
      closedByClass[cls] = (closedByClass[cls] ?? 0) + n;
      closedTotal += n;
    }
  }

  return {
    openByClass,
    closedByClass,
    openTotal,
    closedTotal,
    open,
    recent,
    openTruncated: open.length >= OPEN_VIOLATION_LIMIT,
  };
}

/**
 * DOB complaints are keyed by BIN only — there is no BBL/block/lot column.
 * date_entered is TEXT in MM/DD/YYYY, so a range comparison is meaningless;
 * the year suffix is narrowed server-side with LIKE and the exact cutoff is
 * applied by the caller after parsing.
 */
export async function fetchDobComplaints(
  key: BuildingKey,
  years: readonly number[],
): Promise<DobComplaintsResult> {
  if (!key.bin) return { total24mo: 0, recent: [] };

  const id = DATASETS.dobComplaints.id;
  const yearClause = years.map((y) => `date_entered like '%/${y}'`).join(' OR ');
  const where = `bin='${key.bin}' AND (${yearClause})`;

  const [countRows, recent] = await Promise.all([
    socrataQuery<{ n?: string }>(id, { $where: where, $select: 'count(*) as n' }),
    socrataQuery<DobComplaintRow>(id, {
      $where: where,
      $select: 'complaint_number, status, date_entered, complaint_category, disposition_code',
      $limit: String(TIMELINE_ROW_LIMIT),
    }),
  ]);

  return { total24mo: toCount(countRows[0]?.n), recent };
}

/**
 * DOB violations. issue_date is TEXT in YYYYMMDD, which compares correctly
 * lexicographically, so the date window is applied server-side.
 * Prefers BIN; falls back to boro/block/lot with both padding variants.
 */
export async function fetchDobViolations(
  key: BuildingKey,
  cutoffYyyymmdd: string,
): Promise<DobViolationsResult> {
  const id = DATASETS.dobViolations.id;
  const location = key.bin
    ? `bin='${key.bin}'`
    : `boro='${key.boroId}' AND block in(${quoteList([
        key.paddedBlock,
        key.block,
      ])}) AND lot in(${quoteList([key.paddedLot, key.lot, `0${key.paddedLot}`])})`;

  const recent = await socrataQuery<DobViolationRow>(id, {
    $where: `${location} AND issue_date>='${cutoffYyyymmdd}'`,
    $select:
      'violation_number, issue_date, violation_type, violation_category, violation_type_code, description',
    $order: 'issue_date DESC',
    $limit: String(TIMELINE_ROW_LIMIT),
  });

  return { recent };
}

/** Bedbug annual filings, newest first. Only the last few matter. */
export async function fetchBedbug(key: BuildingKey): Promise<BedbugResult> {
  const filings = await socrataQuery<BedbugRow>(DATASETS.bedbug.id, {
    $where: `bbl='${key.bbl}'`,
    $select:
      'bbl, filing_date, infested_dwelling_unit_count, eradicated_unit_count, re_infested_dwelling_unit, of_dwelling_units',
    $order: 'filing_date DESC',
    $limit: '5',
  });
  return { filings };
}

/**
 * Multiple Dwelling Registrations. Carries no unit count (see DATASETS.pluto),
 * but confirms the building is registered with HPD and backfills BIN when the
 * geocoder gave us none.
 */
export async function fetchRegistration(key: BuildingKey): Promise<RegistrationResult> {
  const rows = await socrataQuery<RegistrationRow>(DATASETS.registrations.id, {
    $where: `boroid='${key.boroId}' AND block in(${quoteList([
      key.block,
      key.paddedBlock,
    ])}) AND lot in(${quoteList([key.lot, key.paddedLot])})`,
    $select: 'registrationid, buildingid, bin, lastregistrationdate, registrationenddate',
    $order: 'lastregistrationdate DESC',
    $limit: '1',
  });
  return { registration: rows[0] ?? null };
}

/** PLUTO: unit counts and year built. BBL is a number column here. */
export async function fetchPluto(key: BuildingKey): Promise<PlutoResult> {
  const rows = await socrataQuery<PlutoRow>(DATASETS.pluto.id, {
    $where: `bbl=${key.bbl}`,
    $select: 'bbl, unitsres, unitstotal, yearbuilt, address, numfloors',
    $limit: '1',
  });
  return { lot: rows[0] ?? null };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export interface BuildingDatasets {
  hpdComplaints: HpdComplaintsResult | null;
  hpdViolations: HpdViolationsResult | null;
  dobComplaints: DobComplaintsResult | null;
  dobViolations: DobViolationsResult | null;
  bedbug: BedbugResult | null;
  registration: RegistrationResult | null;
  pluto: PlutoResult | null;
}

export interface BuildingDatasetsResult {
  data: BuildingDatasets;
  /** One human-readable string per failed dataset, for dataQuality.warnings. */
  warnings: string[];
  /** True when every dataset failed — the caller should treat that as fatal. */
  allFailed: boolean;
}

/** The 24-month window, plus the format each dataset needs it in. */
export function buildDateWindow(asOf: Date): {
  cutoffIso: string;
  cutoffYyyymmdd: string;
  years: number[];
} {
  const cutoff = new Date(asOf);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 2);

  const iso = cutoff.toISOString().slice(0, 19);
  const yyyymmdd = cutoff.toISOString().slice(0, 10).replace(/-/g, '');

  const years: number[] = [];
  for (let y = cutoff.getUTCFullYear(); y <= asOf.getUTCFullYear(); y += 1) years.push(y);

  return { cutoffIso: iso, cutoffYyyymmdd: yyyymmdd, years };
}

/**
 * Fire every dataset in parallel. A dataset that fails degrades the report to a
 * warning rather than failing it — the renter still gets everything else.
 */
export async function fetchBuildingDatasets(
  key: BuildingKey,
  asOf: Date,
): Promise<BuildingDatasetsResult> {
  const { cutoffIso, cutoffYyyymmdd, years } = buildDateWindow(asOf);

  const settled = await Promise.allSettled([
    fetchHpdComplaints(key, cutoffIso),
    fetchHpdViolations(key),
    fetchDobComplaints(key, years),
    fetchDobViolations(key, cutoffYyyymmdd),
    fetchBedbug(key),
    fetchRegistration(key),
    fetchPluto(key),
  ]);

  const [hpdC, hpdV, dobC, dobV, bedbug, registration, pluto] = settled;

  const warnings: string[] = [];
  let failures = 0;

  /** Unwrap one settled dataset, degrading a failure into a warning. */
  const take = <T>(outcome: PromiseSettledResult<T>, name: string): T | null => {
    if (outcome.status === 'fulfilled') return outcome.value;
    failures += 1;
    const reason =
      outcome.reason instanceof Error ? outcome.reason.message : 'unknown error';
    console.error(`[socrata] ${name} failed:`, reason);
    warnings.push(`${name} was unavailable (${reason}); those figures are incomplete.`);
    return null;
  };

  const data: BuildingDatasets = {
    hpdComplaints: take(hpdC, DATASETS.hpdComplaints.name),
    hpdViolations: take(hpdV, DATASETS.hpdViolations.name),
    dobComplaints: take(dobC, DATASETS.dobComplaints.name),
    dobViolations: take(dobV, DATASETS.dobViolations.name),
    bedbug: take(bedbug, DATASETS.bedbug.name),
    registration: take(registration, DATASETS.registrations.name),
    pluto: take(pluto, DATASETS.pluto.name),
  };

  return { data, warnings, allFailed: failures === settled.length };
}
