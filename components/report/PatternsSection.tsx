import type { Pattern } from '@/lib/types';
import { SEVERITY_CHIP, SEVERITY_LABEL } from '@/components/report/reportFormat';
import { cn } from '@/components/ui/cn';

interface PatternsSectionProps {
  patterns: Pattern[];
  onViewRecords: (pattern: Pattern) => void;
}

/**
 * Deterministically detected, never AI-generated — every card here is a
 * template filled with numbers already computed in lib/nyc/aggregate.ts.
 * "View records" opens the shared MetricDrawer with this pattern's filter
 * spec applied against a fresh fetch, so there's no list of IDs to keep in
 * sync with what the drawer actually loads.
 */
export function PatternsSection({ patterns, onViewRecords }: PatternsSectionProps) {
  if (patterns.length === 0) {
    return (
      <p className="rounded-2xl bg-white p-4 text-sm leading-relaxed text-slate-600 ring-1 ring-inset ring-slate-200">
        Nothing in this building's record crosses a recurring, seasonal, or backlog threshold.
        That's a real signal, not an absence of data.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {patterns.map((pattern) => (
        <li key={pattern.key} className="rounded-2xl bg-white p-4 ring-1 ring-inset ring-slate-200">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">{pattern.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{pattern.description}</p>
            </div>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
                SEVERITY_CHIP[pattern.severity],
              )}
            >
              {SEVERITY_LABEL[pattern.severity]}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onViewRecords(pattern)}
            className="mt-3 text-xs font-semibold text-blue-700 underline underline-offset-2"
          >
            View records
          </button>
        </li>
      ))}
    </ul>
  );
}
