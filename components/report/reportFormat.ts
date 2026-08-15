import type { BuildingReport, Category, CategoryStat, Severity, TimelineEvent } from '@/lib/types';

/**
 * Presentation lookups for the report. Every value here is a styling or wording
 * decision — no derived statistics live in this file except pure formatting.
 */

export interface GradeTheme {
  bg: string;
  ring: string;
  fg: string;
  bar: string;
  /** Plain-language reading of our own deterministic score. */
  descriptor: string;
}

export const GRADE_THEME: Record<BuildingReport['grade'], GradeTheme> = {
  A: {
    bg: 'bg-emerald-50',
    ring: 'ring-emerald-200',
    fg: 'text-emerald-800',
    bar: 'bg-emerald-600',
    descriptor: 'Strong record',
  },
  B: {
    bg: 'bg-emerald-50',
    ring: 'ring-emerald-200',
    fg: 'text-emerald-800',
    bar: 'bg-emerald-500',
    descriptor: 'Generally sound',
  },
  C: {
    bg: 'bg-amber-50',
    ring: 'ring-amber-200',
    fg: 'text-amber-900',
    bar: 'bg-amber-500',
    descriptor: 'Mixed record',
  },
  D: {
    bg: 'bg-orange-50',
    ring: 'ring-orange-200',
    fg: 'text-orange-900',
    bar: 'bg-orange-500',
    descriptor: 'Poor record',
  },
  F: {
    bg: 'bg-red-50',
    ring: 'ring-red-200',
    fg: 'text-red-900',
    bar: 'bg-red-600',
    descriptor: 'Serious problems',
  },
};

export const SEVERITY_CHIP: Record<Severity, string> = {
  high: 'bg-red-50 text-red-800 ring-red-200',
  medium: 'bg-amber-50 text-amber-900 ring-amber-200',
  low: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/**
 * Categories a renter feels first. These read heavier than the rest; 'other' reads
 * lighter. Weight is carried by type size and an accent rule, never by color alone.
 */
const EMPHASIZED: ReadonlySet<Category> = new Set<Category>(['heat_hot_water', 'pests']);

export function categoryWeight(key: Category): 'strong' | 'normal' | 'muted' {
  if (EMPHASIZED.has(key)) return 'strong';
  if (key === 'other') return 'muted';
  return 'normal';
}

/** Severity first, then volume in the last 24 months, then lifetime volume. */
export function sortCategories(categories: CategoryStat[]): CategoryStat[] {
  return [...categories].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      b.count24mo - a.count24mo ||
      b.countAllTime - a.countAllTime,
  );
}

export interface SourceMeta {
  label: string;
  datasetId: string;
}

export const SOURCE_META: Record<TimelineEvent['source'], SourceMeta> = {
  HPD_COMPLAINT: { label: 'HPD complaint', datasetId: 'uwyv-629c' },
  HPD_VIOLATION: { label: 'HPD violation', datasetId: 'wvxf-dwi5' },
  DOB_COMPLAINT: { label: 'DOB complaint', datasetId: 'eabe-havv' },
  DOB_VIOLATION: { label: 'DOB violation', datasetId: '3h2n-5cm9' },
};

/** Unresolved items stay at the top; everything else stays newest-first. */
export function pinOpenFirst(timeline: TimelineEvent[]): TimelineEvent[] {
  const open = timeline.filter((event) => event.status === 'open');
  const closed = timeline.filter((event) => event.status !== 'open');
  return [...open, ...closed];
}

/** Category keys map to the labels the API already supplied — never invent one. */
export function categoryLabels(categories: CategoryStat[]): Map<Category, string> {
  return new Map(categories.map((stat) => [stat.key, stat.label]));
}

export function humanizeCategory(key: Category): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Dates arrive as 'YYYY-MM-DD' and parse as UTC midnight. Formatting in the
 * browser's zone would shift every NYC date back a day.
 */
export function formatDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatTimestamp(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
