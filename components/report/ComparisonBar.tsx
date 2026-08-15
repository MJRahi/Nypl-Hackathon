import { cn } from '@/components/ui/cn';

interface ComparisonBarProps {
  /** Null when unit count is unknown — the tile still renders, it just says so. */
  buildingRate: number | null;
  cityMedian: number;
}

function widthPercent(value: number, scale: number): string {
  if (scale <= 0) return '0%';
  return `${Math.min(100, Math.round((value / scale) * 100))}%`;
}

/** Complaints per unit per year against the citywide median. Both numbers printed. */
export function ComparisonBar({ buildingRate, cityMedian }: ComparisonBarProps) {
  if (buildingRate === null) {
    return (
      <div className="rounded-2xl bg-white p-4 ring-1 ring-inset ring-slate-200">
        <p className="text-sm font-semibold text-slate-900">Unit count unavailable</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          We couldn&rsquo;t confirm how many apartments are in this building, so we can&rsquo;t
          compare it to the citywide rate. The citywide median is{' '}
          <span className="font-medium tabular-nums text-slate-900">
            {cityMedian.toFixed(2)}
          </span>{' '}
          complaints per unit per year.
        </p>
      </div>
    );
  }

  const scale = Math.max(buildingRate, cityMedian) * 1.15;
  const ratio = cityMedian > 0 ? buildingRate / cityMedian : null;
  const above = ratio !== null && ratio > 1;

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-inset ring-slate-200">
      <p className="text-sm font-semibold text-slate-900">Complaints per unit, per year</p>

      <div className="mt-4 space-y-3">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs font-medium text-slate-700">This building</span>
            <span className="text-sm font-semibold tabular-nums text-slate-900">
              {buildingRate.toFixed(2)}
            </span>
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn('h-full rounded-full', above ? 'bg-orange-500' : 'bg-emerald-600')}
              style={{ width: widthPercent(buildingRate, scale) }}
            />
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs font-medium text-slate-700">Citywide median</span>
            <span className="text-sm font-semibold tabular-nums text-slate-900">
              {cityMedian.toFixed(2)}
            </span>
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-slate-400"
              style={{ width: widthPercent(cityMedian, scale) }}
            />
          </div>
        </div>
      </div>

      {ratio !== null ? (
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          {above ? (
            <>
              About{' '}
              <span className="font-semibold tabular-nums text-slate-900">
                {ratio.toFixed(1)}&times;
              </span>{' '}
              the citywide median.
            </>
          ) : (
            <>
              Below the citywide median &mdash; about{' '}
              <span className="font-semibold tabular-nums text-slate-900">
                {ratio.toFixed(2)}&times;
              </span>{' '}
              the typical rate.
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
