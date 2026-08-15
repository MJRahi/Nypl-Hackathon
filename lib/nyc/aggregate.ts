import type {
  BuildingReport,
  Category,
  CategoryStat,
  Severity,
  TimelineEvent,
} from '@/lib/types';
import {
  CATEGORY_LABELS,
  mapDobComplaint,
  mapDobViolation,
  mapHpdComplaint,
  mapHpdViolation,
} from '@/lib/nyc/categories';
import {
  DATASETS,
  datasetUrl,
  type BuildingDatasets,
  type DobComplaintRow,
  type DobViolationRow,
  type HpdComplaintRow,
  type HpdViolationRow,
} from '@/lib/nyc/datasets';

/**
 * Every number in the report is computed here, in TypeScript. Nothing in this
 * file is ever delegated to a model.
 */

const TIMELINE_LIMIT = 40;
const CATEGORY_ORDER: Category[] = [
  'heat_hot_water',
  'plumbing',
  'pests',
  'electrical',
  'structural',
  'elevator',
  'safety',
  'other',
];

/**
 * Citywide baseline for context next to complaintsPerUnitPerYear.
 *
 * Derived from published HPD totals: roughly 650k housing-maintenance
 * complaints a year against roughly 2.3M rental units citywide. A fixed,
 * documented constant rather than a per-request computation — it is a
 * comparison line, and it must not move between two buildings' reports.
 */
export const CITY_MEDIAN_COMPLAINTS_PER_UNIT_PER_YEAR = 0.28;

// ---------------------------------------------------------------------------
// Date helpers — every source stores dates differently.
// ---------------------------------------------------------------------------

/** ISO timestamp ("2026-01-02T15:04:05.000") -> "2026-01-02". */
function isoToDate(value: string | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match ? match[1] : null;
}

/** DOB complaints: "11/22/2010" -> "2010-11-22". */
function usDateToIso(value: string | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, mm, dd, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

/** DOB violations: "20251201" -> "2025-12-01". */
function compactDateToIso(value: string | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, yyyy, mm, dd] = match;
  return `${yyyy}-${mm}-${dd}`;
}

function cutoffDateString(asOf: Date, yearsBack: number): string {
  const d = new Date(asOf);
  d.setUTCFullYear(d.getUTCFullYear() - yearsBack);
  return d.toISOString().slice(0, 10);
}

function toInt(value: string | undefined): number | null {
  if (value === undefined || value === null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Collapse the fixed-width padding Socrata returns inside some text columns. */
function squish(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\bHpd\b/g, 'HPD')
    .replace(/\bDob\b/g, 'DOB');
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

function hpdComplaintEvents(rows: HpdComplaintRow[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const seenComplaints = new Set<string>();

  for (const row of rows) {
    const date = isoToDate(row.received_date);
    if (!date) continue;

    // Rows are one-per-problem; a complaint with four problems would otherwise
    // occupy four timeline slots. Rows arrive newest-first, so the first
    // problem seen for a complaint is the one kept.
    const complaintId = row.complaint_id ?? row.problem_id ?? '';
    if (complaintId && seenComplaints.has(complaintId)) continue;
    if (complaintId) seenComplaints.add(complaintId);

    const major = squish(row.major_category);
    const problem = squish(row.problem_code);
    const detail = problem && problem !== 'N/A' ? `${major} — ${problem}` : major;

    events.push({
      date,
      source: 'HPD_COMPLAINT',
      category: mapHpdComplaint(row.major_category, row.problem_code),
      status: squish(row.complaint_status).toUpperCase().startsWith('CLOSE') ? 'closed' : 'open',
      description: titleCase(detail) || 'Housing maintenance complaint',
      className: null,
    });
  }

  return events;
}

function hpdViolationEvents(rows: HpdViolationRow[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const row of rows) {
    const date = isoToDate(row.novissueddate);
    if (!date) continue;

    const description = squish(row.novdescription)
      // Drop the statutory citation prefix; the renter wants the requirement.
      .replace(/^(HMC\s+)?(ADM CODE:?\s*)?§?\s*[\d.\-]+\s*(ADM CODE)?[:\-]?\s*/i, '')
      .trim();

    const cls = squish(row.class).toUpperCase();

    events.push({
      date,
      source: 'HPD_VIOLATION',
      category: mapHpdViolation(row.novdescription),
      status: squish(row.violationstatus).toLowerCase() === 'open' ? 'open' : 'closed',
      description: description || 'Housing maintenance code violation',
      className: cls === 'A' || cls === 'B' || cls === 'C' ? cls : null,
    });
  }

  return events;
}

function dobComplaintEvents(rows: DobComplaintRow[], cutoff: string): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const row of rows) {
    // The server-side filter narrows by year only, so apply the real cutoff here.
    const date = usDateToIso(row.date_entered);
    if (!date || date < cutoff) continue;

    const code = squish(row.complaint_category);

    events.push({
      date,
      source: 'DOB_COMPLAINT',
      category: mapDobComplaint(row.complaint_category),
      status: squish(row.status).toUpperCase() === 'ACTIVE' ? 'open' : 'closed',
      description: `DOB complaint${code ? ` (category ${code})` : ''}`,
      className: null,
    });
  }

  return events;
}

function dobViolationEvents(rows: DobViolationRow[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const row of rows) {
    const date = compactDateToIso(row.issue_date);
    if (!date) continue;

    const type = squish(row.violation_type);
    const label = type.includes('-') ? type.slice(type.indexOf('-') + 1).trim() : type;
    const category = squish(row.violation_category).toUpperCase();

    events.push({
      date,
      source: 'DOB_VIOLATION',
      category: mapDobViolation(row.violation_type),
      status: category.includes('ACTIVE') ? 'open' : 'closed',
      description: titleCase(label) || 'DOB violation',
      className: null,
    });
  }

  return events;
}

/** Newest 40, descending, merged across all four sources. */
export function buildTimeline(data: BuildingDatasets, cutoff: string): TimelineEvent[] {
  const events: TimelineEvent[] = [
    ...hpdComplaintEvents(data.hpdComplaints?.recent ?? []),
    ...hpdViolationEvents(data.hpdViolations?.recent ?? []),
    ...dobComplaintEvents(data.dobComplaints?.recent ?? [], cutoff),
    ...dobViolationEvents(data.dobViolations?.recent ?? []),
  ];

  events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return events.slice(0, TIMELINE_LIMIT);
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/**
 * Severity is a deterministic function of the counts, so two buildings with the
 * same numbers always get the same badge.
 */
function severityFor(openCount: number, count24mo: number): Severity {
  if (openCount >= 3 || count24mo >= 5) return 'high';
  if (openCount >= 1 || count24mo >= 2) return 'medium';
  return 'low';
}

export function buildCategoryStats(data: BuildingDatasets): CategoryStat[] {
  const count24 = new Map<Category, number>();
  const countAll = new Map<Category, number>();
  const open = new Map<Category, number>();

  const add = (map: Map<Category, number>, key: Category, n: number): void => {
    map.set(key, (map.get(key) ?? 0) + n);
  };

  for (const row of data.hpdComplaints?.byCategory24mo ?? []) {
    add(count24, mapHpdComplaint(row.key), row.count);
  }
  for (const row of data.hpdComplaints?.byCategoryAllTime ?? []) {
    add(countAll, mapHpdComplaint(row.key), row.count);
  }
  for (const row of data.hpdViolations?.open ?? []) {
    add(open, mapHpdViolation(row.novdescription), 1);
  }

  return CATEGORY_ORDER.map((key) => {
    const c24 = count24.get(key) ?? 0;
    const cAll = countAll.get(key) ?? 0;
    const openCount = open.get(key) ?? 0;
    return {
      key,
      label: CATEGORY_LABELS[key],
      count24mo: c24,
      countAllTime: cAll,
      openCount,
      severity: severityFor(openCount, c24),
    };
  });
}

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------

export interface ScoreInput {
  openClassC: number;
  openClassB: number;
  hpdComplaints24mo: number;
  bedbugReportedWithin2y: boolean;
  openViolations: number;
  unitCount: number | null;
}

export interface ScoreResult {
  score: number;
  grade: BuildingReport['grade'];
}

/**
 * The frozen formula, implemented literally:
 *   start 100
 *   -12 per open class C, capped at 40
 *   -4 per open class B, capped at 20
 *   -1 per HPD complaint in 24mo, capped at 25
 *   -10 if a bedbug infestation was reported within 2 years
 *   +10 if there are zero open violations
 *   when unitCount is known: complaintPenalty *= 12 / max(unitCount, 4)
 *   clamp to 0..100
 *
 * The cap is applied to the complaint penalty before the per-unit scaling, so
 * the cap bounds complaint volume and the multiplier then adjusts for building
 * size — a 200-unit building is not punished for being large.
 */
export function computeScore(input: ScoreInput): ScoreResult {
  const classCPenalty = Math.min(input.openClassC * 12, 40);
  const classBPenalty = Math.min(input.openClassB * 4, 20);

  let complaintPenalty = Math.min(input.hpdComplaints24mo * 1, 25);
  if (input.unitCount !== null && input.unitCount > 0) {
    complaintPenalty *= 12 / Math.max(input.unitCount, 4);
  }

  const bedbugPenalty = input.bedbugReportedWithin2y ? 10 : 0;
  const cleanBonus = input.openViolations === 0 ? 10 : 0;

  const raw =
    100 - classCPenalty - classBPenalty - complaintPenalty - bedbugPenalty + cleanBonus;
  const score = Math.round(Math.min(100, Math.max(0, raw)));

  return { score, grade: gradeFor(score) };
}

export function gradeFor(score: number): BuildingReport['grade'] {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

// ---------------------------------------------------------------------------
// Report assembly
// ---------------------------------------------------------------------------

export interface AggregateInput {
  address: string;
  bbl: string;
  bin: string | null;
  borough: string;
  lat: number;
  lng: number;
  data: BuildingDatasets;
  warnings: string[];
  asOf: Date;
}

/**
 * Unit count comes from PLUTO's residential unit count, falling back to total
 * units, then to the dwelling-unit count on a bedbug filing. If none of those
 * produce a positive number, unitCount stays null and unitCountKnown is false —
 * a per-unit rate is never invented, and the score simply skips the per-unit
 * adjustment.
 */
function resolveUnitCount(data: BuildingDatasets): number | null {
  const pluto = data.pluto?.lot;
  const residential = toInt(pluto?.unitsres);
  if (residential !== null && residential > 0) return residential;

  const total = toInt(pluto?.unitstotal);
  if (total !== null && total > 0) return total;

  const fromBedbug = toInt(data.bedbug?.filings[0]?.of_dwelling_units);
  if (fromBedbug !== null && fromBedbug > 0) return fromBedbug;

  return null;
}

function resolveBedbug(
  data: BuildingDatasets,
  asOf: Date,
): { reported: boolean; infestedUnits: number | null; year: number | null } {
  const twoYearsAgo = cutoffDateString(asOf, 2);

  for (const filing of data.bedbug?.filings ?? []) {
    const date = isoToDate(filing.filing_date);
    if (!date || date < twoYearsAgo) continue;

    const infested = toInt(filing.infested_dwelling_unit_count) ?? 0;
    const reinfested = toInt(filing.re_infested_dwelling_unit) ?? 0;
    const total = infested + reinfested;
    if (total <= 0) continue;

    return { reported: true, infestedUnits: total, year: Number(date.slice(0, 4)) };
  }

  return { reported: false, infestedUnits: null, year: null };
}

export function aggregateReport(input: AggregateInput): BuildingReport {
  const { data, asOf } = input;
  const cutoff24 = cutoffDateString(asOf, 2);
  const warnings = [...input.warnings];

  const unitCount = resolveUnitCount(data);
  const unitCountKnown = unitCount !== null;
  if (!unitCountKnown) {
    warnings.push(
      'Unit count is unavailable for this lot, so per-unit complaint rates are not shown.',
    );
  }

  if (data.hpdViolations?.openTruncated) {
    warnings.push(
      'This building has an unusually large number of open violations; the per-category breakdown covers the most recent 400.',
    );
  }

  const bedbug = resolveBedbug(data, asOf);

  const openByClass = data.hpdViolations?.openByClass ?? {};
  const openClassC = openByClass['C'] ?? 0;
  const openClassB = openByClass['B'] ?? 0;
  const openViolations = data.hpdViolations?.openTotal ?? 0;
  const closedViolations = data.hpdViolations?.closedTotal ?? 0;

  const hpdComplaintsAllTime = data.hpdComplaints?.totalAllTime ?? 0;
  const hpdComplaints24mo = data.hpdComplaints?.total24mo ?? 0;

  // DOB complaints are year-narrowed server-side; count the exact window here.
  const dobComplaints24mo = (data.dobComplaints?.recent ?? []).filter((row) => {
    const date = usDateToIso(row.date_entered);
    return date !== null && date >= cutoff24;
  }).length;

  const complaintsPerUnitPerYear =
    unitCount !== null && unitCount > 0
      ? Math.round((hpdComplaints24mo / unitCount / 2) * 100) / 100
      : null;

  const { score, grade } = computeScore({
    openClassC,
    openClassB,
    hpdComplaints24mo,
    bedbugReportedWithin2y: bedbug.reported,
    openViolations,
    unitCount,
  });

  const yearBuilt = (() => {
    const year = toInt(data.pluto?.lot?.yearbuilt);
    return year !== null && year > 1600 ? year : null;
  })();

  return {
    address: input.address,
    bbl: input.bbl,
    bin: input.bin,
    borough: input.borough,
    lat: input.lat,
    lng: input.lng,
    unitCount,
    yearBuilt,
    grade,
    score,
    stats: {
      hpdComplaintsAllTime,
      hpdComplaints24mo,
      openViolations,
      closedViolations,
      classCViolations: openClassC,
      dobComplaints24mo,
      complaintsPerUnitPerYear,
      cityMedianPerUnitPerYear: CITY_MEDIAN_COMPLAINTS_PER_UNIT_PER_YEAR,
    },
    categories: buildCategoryStats(data),
    timeline: buildTimeline(data, cutoff24),
    bedbug,
    narrative: null,
    dataAsOf: asOf.toISOString(),
    dataQuality: {
      unitCountKnown,
      matchedBin: input.bin !== null,
      warnings,
    },
    sources: [
      DATASETS.hpdComplaints,
      DATASETS.hpdViolations,
      DATASETS.dobComplaints,
      DATASETS.dobViolations,
      DATASETS.bedbug,
      DATASETS.registrations,
      DATASETS.pluto,
    ].map((d) => ({ name: d.name, datasetId: d.id, url: datasetUrl(d.id) })),
  };
}
