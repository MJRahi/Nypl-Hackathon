/**
 * LeaseLens NYC — FROZEN CONTRACT.
 *
 * Do not change, add, rename, or remove anything in this file.
 * Three lanes build against it in parallel. Comments may be edited; shapes may not.
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
    dobComplaints24mo: number;
    /** hpdComplaints24mo / unitCount / 2. null when unitCount is unknown. */
    complaintsPerUnitPerYear: number | null;
    cityMedianPerUnitPerYear: number;
  };
  categories: CategoryStat[];
  /** Newest 40, descending by date. */
  timeline: TimelineEvent[];
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
