/**
 * Before You Sign NYC — type contract.
 *
 * Originally frozen for three lanes building in parallel; the freeze was
 * explicitly lifted by the project owner to add the drill-down dashboard
 * (record-level detail, score breakdown, deterministic patterns). Existing
 * shapes are still never renamed or removed — only added to.
 */

export type Category =
  | 'heat_hot_water'
  | 'plumbing'
  | 'pests'
  | 'electrical'
  | 'structural'
  | 'elevator'
  | 'safety'
  | 'other';

export type Severity = 'low' | 'medium' | 'high';

export interface AddressCandidate {
  label: string;
  bbl: string;
  bin: string | null;
  borough: string;
  lat: number;
  lng: number;
  /** 0..1 — geocoder match confidence. */
  confidence: number;
}

export interface CategoryStat {
  key: Category;
  label: string;
  /**
   * Complaints in the last 24 months that mentioned this category.
   *
   * These OVERLAP and do not partition the total: one HPD complaint can raise
   * problems in several categories at once, and is counted in each. Summing
   * count24mo across categories therefore exceeds stats.hpdComplaints24mo —
   * on real buildings by up to ~1.7x. Never render these as parts of a whole.
   */
  count24mo: number;
  /** Complaints all time that mentioned this category. Overlaps, as above. */
  countAllTime: number;
  /**
   * Open HPD violations in this category. Unlike the complaint counts, each
   * violation lands in exactly one category, so these DO sum to
   * stats.openViolations.
   */
  openCount: number;
  severity: Severity;
}

export interface TimelineEvent {
  /** ISO date, 'YYYY-MM-DD'. */
  date: string;
  source: 'HPD_COMPLAINT' | 'HPD_VIOLATION' | 'DOB_COMPLAINT' | 'DOB_VIOLATION';
  category: Category;
  status: 'open' | 'closed';
  description: string;
  /** HPD violation class 'A' | 'B' | 'C'. null for complaints and DOB violations. */
  className: string | null;
}

export interface MediaFinding {
  id: string;
  label: string;
  category: Category;
  confidence: Severity;
  frameIndex: number;
  note: string;
}

export interface MediaAnalysis {
  frameCount: number;
  findings: MediaFinding[];
  disclaimer: string;
}

/**
 * A single real NYC record backing a metric — fetched on demand via
 * GET /api/building/records, never embedded in BuildingReport (some
 * buildings have 1000+ records; the main report payload stays light).
 */
export interface RecordDetail {
  /** The dataset's own ID column (violationid, complaint_id, complaint_number, violation_number). */
  id: string;
  /** ISO date, 'YYYY-MM-DD'. */
  date: string;
  source: 'HPD_COMPLAINT' | 'HPD_VIOLATION' | 'DOB_COMPLAINT' | 'DOB_VIOLATION';
  category: Category;
  status: 'open' | 'closed';
  /** HPD violation class 'A' | 'B' | 'C'. null for complaints and DOB violations. */
  className: string | null;
  description: string;
  /** Apartment/unit, when the source dataset actually carries one. Never guessed. */
  unit: string | null;
  /** A live Socrata equality-filter URL returning exactly this record. */
  sourceUrl: string;
}

/**
 * Every term of the frozen score formula, exposed rather than discarded, so
 * "Why this score?" shows exactly what was computed — never a re-derived
 * approximation.
 */
export interface ScoreBreakdown {
  start: number;
  classCCount: number;
  classCPenalty: number;
  classBCount: number;
  classBPenalty: number;
  /** hpdComplaints24mo, before the cap. */
  complaintCount: number;
  /** After the cap (25), before per-unit scaling. */
  complaintPenaltyBeforeScaling: number;
  /** 12 / max(unitCount, 4). null when unitCount is unknown — no scaling applied. */
  unitScaleFactor: number | null;
  /** After scaling — the amount actually subtracted. */
  complaintPenalty: number;
  bedbugReported: boolean;
  bedbugPenalty: number;
  openViolations: number;
  cleanBonus: number;
  /** Before clamping to 0-100. */
  rawTotal: number;
  /** After clamping — equals BuildingReport.score. */
  finalScore: number;
}

/**
 * A deterministically-detected pattern — plain-language template filled with
 * real numbers already computed elsewhere. Never AI-generated. "View
 * records" applies this filter spec against a fresh /api/building/records
 * fetch, so there is no separate list of record IDs to keep in sync.
 */
export interface Pattern {
  key: string;
  label: string;
  description: string;
  severity: Severity;
  category: Category | null;
  statusFilter: 'open' | 'closed' | null;
  classFilter: 'A' | 'B' | 'C' | null;
}

export interface BuildingReport {
  address: string;
  bbl: string;
  bin: string | null;
  borough: string;
  lat: number;
  lng: number;
  unitCount: number | null;
  yearBuilt: number | null;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  score: number;
  stats: {
    hpdComplaintsAllTime: number;
    hpdComplaints24mo: number;
    /** Open HPD violations, all classes. */
    openViolations: number;
    closedViolations: number;
    /** Open HPD violations of class C (immediately hazardous). */
    classCViolations: number;
    /** Open HPD violations of class B. */
    classBViolations: number;
    dobComplaints24mo: number;
    /** hpdComplaints24mo / unitCount / 2. null when unitCount is unknown. */
    complaintsPerUnitPerYear: number | null;
    cityMedianPerUnitPerYear: number;
  };
  categories: CategoryStat[];
  /** Newest 40, descending by date. */
  timeline: TimelineEvent[];
  /** Every term of the score formula. finalScore always equals `score` above. */
  scoreBreakdown: ScoreBreakdown;
  /** Deterministically detected, not AI-generated. May be empty. */
  patterns: Pattern[];
  bedbug: { reported: boolean; infestedUnits: number | null; year: number | null };
  narrative: { summary: string; redFlags: string[]; questionsToAsk: string[] } | null;
  /** ISO timestamp of the data pull. */
  dataAsOf: string;
  dataQuality: { unitCountKnown: boolean; matchedBin: boolean; warnings: string[] };
  sources: { name: string; datasetId: string; url: string }[];
}

export type ErrorCode = 'RATE_LIMITED' | 'NOT_FOUND' | 'UPSTREAM_DOWN' | 'BAD_INPUT';

export interface ApiError {
  error: { code: ErrorCode; message: string };
}
