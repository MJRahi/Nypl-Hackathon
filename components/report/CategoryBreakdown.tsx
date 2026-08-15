import type { CategoryStat } from '@/lib/types';
import {
  SEVERITY_CHIP,
  SEVERITY_LABEL,
  categoryWeight,
  sortCategories,
} from '@/components/report/reportFormat';
import { cn } from '@/components/ui/cn';

function Row({ stat, scale }: { stat: CategoryStat; scale: number }) {
  const weight = categoryWeight(stat.key);
  const width = scale > 0 ? Math.min(100, Math.round((stat.count24mo / scale) * 100)) : 0;

  return (
    <li
      className={cn(
        'rounded-2xl bg-white p-4 ring-1 ring-inset ring-slate-200',
        weight === 'strong' && 'border-l-4 border-l-blue-700',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(
              'truncate',
              weight === 'strong' && 'text-base font-semibold text-slate-900',
              weight === 'normal' && 'text-sm font-medium text-slate-900',
              weight === 'muted' && 'text-sm font-normal text-slate-500',
            )}
          >
            {stat.label}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            <span className="tabular-nums">{stat.countAllTime}</span> all time
            {stat.openCount > 0 ? (
              <>
                {' · '}
                <span className="font-semibold text-red-700">
                  <span className="tabular-nums">{stat.openCount}</span> open
                </span>
              </>
            ) : null}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xl font-semibold tabular-nums text-slate-900">
            {stat.count24mo}
          </span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
              SEVERITY_CHIP[stat.severity],
            )}
          >
            {SEVERITY_LABEL[stat.severity]}
          </span>
        </div>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn('h-full rounded-full', weight === 'muted' ? 'bg-slate-300' : 'bg-blue-700')}
          style={{ width: `${width}%` }}
        />
      </div>
    </li>
  );
}

export function CategoryBreakdown({ categories }: { categories: CategoryStat[] }) {
  const sorted = sortCategories(categories);
  const scale = Math.max(...sorted.map((stat) => stat.count24mo), 1);

  return (
    <ul className="space-y-3">
      {sorted.map((stat) => (
        <Row key={stat.key} stat={stat} scale={scale} />
      ))}
    </ul>
  );
}
