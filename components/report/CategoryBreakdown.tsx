import type { CategoryStat } from '@/lib/types';
import type { DrawerRequest } from '@/components/report/MetricDrawer';
import {
  SEVERITY_CHIP,
  SEVERITY_LABEL,
  categoryWeight,
  sortCategories,
} from '@/components/report/reportFormat';
import { cn } from '@/components/ui/cn';

function Row({
  stat,
  scale,
  onOpenDrawer,
}: {
  stat: CategoryStat;
  scale: number;
  onOpenDrawer: (request: Omit<DrawerRequest, 'token'>) => void;
}) {
  const weight = categoryWeight(stat.key);
  const width = scale > 0 ? Math.min(100, Math.round((stat.count24mo / scale) * 100)) : 0;

  return (
    <li
      className={cn(
        'rounded-2xl bg-white ring-1 ring-inset ring-slate-200',
        weight === 'strong' && 'border-l-4 border-l-blue-700',
      )}
    >
      <button
        type="button"
        onClick={() =>
          onOpenDrawer({
            title: stat.label,
            source: null,
            category: stat.key,
            statusFilter: null,
            classFilter: null,
            within24mo: false,
          })
        }
        className="w-full rounded-2xl p-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
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
        <p className="mt-2 text-[11px] font-semibold text-blue-700">View records &rarr;</p>
      </button>
    </li>
  );
}

interface CategoryBreakdownProps {
  categories: CategoryStat[];
  onOpenDrawer: (request: Omit<DrawerRequest, 'token'>) => void;
}

export function CategoryBreakdown({ categories, onOpenDrawer }: CategoryBreakdownProps) {
  const sorted = sortCategories(categories);
  const scale = Math.max(...sorted.map((stat) => stat.count24mo), 1);

  return (
    <ul className="space-y-3">
      {sorted.map((stat) => (
        <Row key={stat.key} stat={stat} scale={scale} onOpenDrawer={onOpenDrawer} />
      ))}
    </ul>
  );
}
