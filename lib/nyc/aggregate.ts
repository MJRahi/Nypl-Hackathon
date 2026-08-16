import type {
  BuildingReport,
  Category,
  CategoryStat,
  Pattern,
  RecordDetail,
  ScoreBreakdown,
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

/** Recurring-category pattern threshold, mirrored from severityFor's own thresholds below. */
const HEATING_SEASON_MONTHS = new Set([11, 12, 1, 2, 3]);

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

export function cutoffDateString(asOf: Date, yearsBack: number): string {
  const d = new Date(asOf);
  d.setUTCFullYear(d.getUTCFullYear() - yearsBack);
  return d.toISOString().slice(0, 10);
}

function cutoffDateStringDays(asOf: Date, daysBack: number): string {
  const d = new Date(asOf);
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

/** A Socrata equality-filter link that returns exactly this one record — verified live per dataset. */
function sourceUrlFor(datasetId: string, idField: string, rawId: string): string {
  if (!rawId) return datasetUrl(datasetId);
  return `${datasetUrl(datasetId)}?${idField}=${encodeURIComponent(rawId)}`;
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
// Records — full detail behind the drill-down drawer. Unlike the timeline,
// not capped at 40; still bounded by the same fetch limits datasets.ts
// already applies (TIMELINE_ROW_LIMIT / OPEN_VIOLATION_LIMIT), which the
// caller communicates honestly via the returned count rather than a false
// claim of completeness.
// ---------------------------------------------------------------------------

/**
 * One row per distinct complaint (matching how stats.hpdComplaints* are
 * counted — count(distinct complaint_id), never count(*)). When several
 * problem rows share a complaint_id, the extras are folded into the
 * description rather than silently dropped.
 */
function hpdComplaintRecords(rows: HpdComplaintRow[]): RecordDetail[] {
  const records: RecordDetail[] = [];
  const indexByComplaint = new Map<string, number>();
  const extraProblems = new Map<string, number>();

  for (const row of rows) {
    const date = isoToDate(row.received_date);
    if (!date) continue;

    const complaintId = (row.complaint_id ?? row.problem_id ?? '').trim();
    if (complaintId && indexByComplaint.has(complaintId)) {
      extraProblems.set(complaintId, (extraProblems.get(complaintId) ?? 0) + 1);
      continue;
    }

    const major = squish(row.major_category);
    const problem = squish(row.problem_code);
    const detail = problem && problem !== 'N/A' ? `${major} — ${problem}` : major;

    if (complaintId) indexByComplaint.set(complaintId, records.length);
    records.push({
      id: complaintId || `hpd-complaint-${records.length + 1}`,
      date,
      source: 'HPD_COMPLAINT',
      category: mapHpdComplaint(row.major_category, row.problem_code),
      status: squish(row.complaint_status).toUpperCase().startsWith('CLOSE') ? 'closed' : 'open',
      description: titleCase(detail) || 'Housing maintenance complaint',
      className: null,
      unit: squish(row.apartment) || null,
      sourceUrl: sourceUrlFor(DATASETS.hpdComplaints.id, 'complaint_id', complaintId),
    });
  }

  for (const [complaintId, extra] of Array.from(extraProblems)) {
    const index = indexByComplaint.get(complaintId);
    if (index === undefined) continue;
    const record = records[index];
    record.description = `${record.description} (+${extra} other issue${extra === 1 ? '' : 's'} reported in this complaint)`;
  }

  return records;
}

/**
 * Open violations (near-exhaustive, up to OPEN_VIOLATION_LIMIT) plus the
 * closed subset already pulled for the timeline — a closed violation older
 * than that recent window simply won't appear here, same limitation the
 * timeline already has.
 */
function hpdViolationRecords(open: HpdViolationRow[], recent: HpdViolationRow[]): RecordDetail[] {
  const records: RecordDetail[] = [];
  const seen = new Set<string>();

  const addRow = (row: HpdViolationRow, forcedStatus: 'open' | 'closed' | null): void => {
    const date = isoToDate(row.novissueddate);
    if (!date) return;

    const violationId = (row.violationid ?? '').trim();
    const id = violationId || `hpd-violation-${records.length + 1}`;
    if (seen.has(id)) return;
    seen.add(id);

    const description = squish(row.novdescription)
      .replace(/^(HMC\s+)?(ADM CODE:?\s*)?§?\s*[\d.\-]+\s*(ADM CODE)?[:\-]?\s*/i, '')
      .trim();
    const cls = squish(row.class).toUpperCase();
    const status =
      forcedStatus ?? (squish(row.violationstatus).toLowerCase() === 'open' ? 'open' : 'closed');

    records.push({
      id,
      date,
      source: 'HPD_VIOLATION',
      category: mapHpdViolation(row.novdescription),
      status,
      className: cls === 'A' || cls === 'B' || cls === 'C' ? cls : null,
      description: description || 'Housing maintenance code violation',
      unit: squish(row.apartment) || null,
      sourceUrl: sourceUrlFor(DATASETS.hpdViolations.id, 'violationid', violationId),
    });
  };

  for (const row of open) addRow(row, 'open');
  for (const row of recent) {
    if (squish(row.violationstatus).toLowerCase() !== 'open') addRow(row, 'closed');
  }

  return records;
}

/** Apartment/unit isn't selected for DOB complaints — its "unit" column is an internal DOB office code, not a dwelling unit. */
function dobComplaintRecords(rows: DobComplaintRow[], cutoff: string): RecordDetail[] {
  const records: RecordDetail[] = [];

  for (const row of rows) {
    const date = usDateToIso(row.date_entered);
    if (!date || date < cutoff) continue;

    const code = squish(row.complaint_category);
    const complaintNumber = (row.complaint_number ?? '').trim();

    records.push({
      id: complaintNumber || `dob-complaint-${records.length + 1}`,
      date,
      source: 'DOB_COMPLAINT',
      category: mapDobComplaint(row.complaint_category),
      status: squish(row.status).toUpperCase() === 'ACTIVE' ? 'open' : 'closed',
      className: null,
      description: `DOB complaint${code ? ` (category ${code})` : ''}`,
      unit: null,
      sourceUrl: sourceUrlFor(DATASETS.dobComplaints.id, 'complaint_number', complaintNumber),
    });
  }

  return records;
}

function dobViolationRecords(rows: DobViolationRow[]): RecordDetail[] {
  const records: RecordDetail[] = [];

  for (const row of rows) {
    const date = compactDateToIso(row.issue_date);
    if (!date) continue;

    const type = squish(row.violation_type);
    const label = type.includes('-') ? type.slice(type.indexOf('-') + 1).trim() : type;
    const category = squish(row.violation_category).toUpperCase();
    const violationNumber = (row.violation_number ?? '').trim();

    records.push({
      id: violationNumber || `dob-violation-${records.length + 1}`,
      date,
      source: 'DOB_VIOLATION',
      category: mapDobViolation(row.violation_type),
      status: category.includes('ACTIVE') ? 'open' : 'closed',
      className: null,
      description: titleCase(label) || 'DOB violation',
      unit: null,
      sourceUrl: sourceUrlFor(DATASETS.dobViolations.id, 'violation_number', violationNumber),
    });
  }

  return records;
}

/**
 * The full record set behind the drill-down drawer, newest first. Used both
 * by /api/building/records (via lib/nyc/records.ts) and internally here to
 * feed detectPatterns — a pure function, so computing it twice from already-
 * fetched data costs nothing extra over the network.
 */
export function buildRecords(data: BuildingDatasets, cutoff24: string): RecordDetail[] {
  const records: RecordDetail[] = [
    ...hpdComplaintRecords(data.hpdComplaints?.recent ?? []),
    ...hpdViolationRecords(data.hpdViolations?.open ?? [], data.hpdViolations?.recent ?? []),
    ...dobComplaintRecords(data.dobComplaints?.recent ?? [], cutoff24),
    ...dobViolationRecords(data.dobViolations?.recent ?? []),
  ];

  records.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return records;
}

// ---------------------------------------------------------------------------
// Patterns — deterministic, template-filled with real numbers. No AI.
// ---------------------------------------------------------------------------

/** Dec/Jan/Feb/Mar of the same winter share a season key (the year heating season started). */
function seasonKeyFor(dateIso: string): number {
  const [yearStr, monthStr] = dateIso.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  return month <= 3 ? year - 1 : year;
}

export function detectPatterns(
  records: RecordDetail[],
  categories: CategoryStat[],
  hpdComplaints24mo: number,
  openClassC: number,
  asOf: Date,
): Pattern[] {
  const patterns: Pattern[] = [];

  for (const stat of categories) {
    if (stat.key === 'other') continue;
    if (stat.count24mo >= 3 || stat.openCount >= 2) {
      patterns.push({
        key: `recurring_${stat.key}`,
        label: `Recurring ${stat.label.toLowerCase()} issues`,
        description:
          stat.count24mo >= 3
            ? `${stat.count24mo} ${stat.label.toLowerCase()} complaints filed in the last 24 months.`
            : `${stat.openCount} open ${stat.label.toLowerCase()} violation${stat.openCount === 1 ? '' : 's'} on record.`,
        severity: stat.severity,
        category: stat.key,
        statusFilter: null,
        classFilter: null,
      });
    }
  }

  if (openClassC > 0) {
    patterns.push({
      key: 'unresolved_class_c',
      label: 'Unresolved immediately-hazardous violations',
      description: `${openClassC} open class C violation${openClassC === 1 ? '' : 's'} — the city's most serious tier — still unresolved.`,
      severity: 'high',
      category: null,
      statusFilter: 'open',
      classFilter: 'C',
    });
  }

  const heatingSeasons = new Set<number>();
  for (const record of records) {
    if (record.source !== 'HPD_COMPLAINT' || record.category !== 'heat_hot_water') continue;
    const month = Number(record.date.split('-')[1]);
    if (!HEATING_SEASON_MONTHS.has(month)) continue;
    heatingSeasons.add(seasonKeyFor(record.date));
  }
  if (heatingSeasons.size >= 2) {
    patterns.push({
      key: 'seasonal_heat',
      label: 'Heat outages recur every heating season',
      description: `Heat or hot water complaints were filed in ${heatingSeasons.size} different heating seasons on record.`,
      severity: 'high',
      category: 'heat_hot_water',
      statusFilter: null,
      classFilter: null,
    });
  }

  const cutoff90 = cutoffDateStringDays(asOf, 90);
  const recentComplaintCount = records.filter(
    (r) => r.source === 'HPD_COMPLAINT' && r.date >= cutoff90,
  ).length;
  if (hpdComplaints24mo >= 4 && recentComplaintCount >= 3 && recentComplaintCount / hpdComplaints24mo >= 0.5) {
    patterns.push({
      key: 'recent_spike',
      label: 'Recent increase in complaints',
      description: `${recentComplaintCount} of the ${hpdComplaints24mo} HPD complaints filed in the last 24 months were filed in just the last 90 days.`,
      severity: 'high',
      category: null,
      statusFilter: null,
      classFilter: null,
    });
  }

  const cutoff365 = cutoffDateStringDays(asOf, 365);
  const longOpenCount = records.filter(
    (r) => r.source === 'HPD_VIOLATION' && r.status === 'open' && r.date <= cutoff365,
  ).length;
  if (longOpenCount > 0) {
    patterns.push({
      key: 'long_unresolved_backlog',
      label: 'Violations left unresolved for over a year',
      description: `${longOpenCount} open violation${longOpenCount === 1 ? '' : 's'} ${longOpenCount === 1 ? 'was' : 'were'} issued more than a year ago and ${longOpenCount === 1 ? 'is' : 'are'} still open.`,
      severity: 'high',
      category: null,
      statusFilter: 'open',
      classFilter: null,
    });
  }

  return patterns;
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
  breakdown: ScoreBreakdown;
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
 *
 * Every intermediate term is returned in `breakdown` rather than discarded,
 * so "Why this score?" always shows exactly what was computed here — never a
 * client-side re-derivation that could drift from this function.
 */
export function computeScore(input: ScoreInput): ScoreResult {
  const classCPenalty = Math.min(input.openClassC * 12, 40);
  const classBPenalty = Math.min(input.openClassB * 4, 20);

  const complaintPenaltyBeforeScaling = Math.min(input.hpdComplaints24mo * 1, 25);
  const unitScaleFactor =
    input.unitCount !== null && input.unitCount > 0 ? 12 / Math.max(input.unitCount, 4) : null;
  const complaintPenalty =
    unitScaleFactor !== null
      ? complaintPenaltyBeforeScaling * unitScaleFactor
      : complaintPenaltyBeforeScaling;

  const bedbugPenalty = input.bedbugReportedWithin2y ? 10 : 0;
  const cleanBonus = input.openViolations === 0 ? 10 : 0;

  const rawTotal =
    100 - classCPenalty - classBPenalty - complaintPenalty - bedbugPenalty + cleanBonus;
  const finalScore = Math.round(Math.min(100, Math.max(0, rawTotal)));

  return {
    score: finalScore,
    grade: gradeFor(finalScore),
    breakdown: {
      start: 100,
      classCCount: input.openClassC,
      classCPenalty,
      classBCount: input.openClassB,
      classBPenalty,
      complaintCount: input.hpdComplaints24mo,
      complaintPenaltyBeforeScaling,
      unitScaleFactor,
      complaintPenalty,
      bedbugReported: input.bedbugReportedWithin2y,
      bedbugPenalty,
      openViolations: input.openViolations,
      cleanBonus,
      rawTotal,
      finalScore,
    },
  };
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

  const { score, grade, breakdown } = computeScore({
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

  const categories = buildCategoryStats(data);
  const records = buildRecords(data, cutoff24);
  const patterns = detectPatterns(records, categories, hpdComplaints24mo, openClassC, asOf);

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
      classBViolations: openClassB,
      dobComplaints24mo,
      complaintsPerUnitPerYear,
      cityMedianPerUnitPerYear: CITY_MEDIAN_COMPLAINTS_PER_UNIT_PER_YEAR,
    },
    categories,
    timeline: buildTimeline(data, cutoff24),
    scoreBreakdown: breakdown,
    patterns,
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
