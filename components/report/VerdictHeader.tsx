import Link from 'next/link';
import type { BuildingReport } from '@/lib/types';
import { GRADE_THEME } from '@/components/report/reportFormat';
import { cn } from '@/components/ui/cn';

/**
 * The hero. Grade letter and score are both printed, so the color is never doing
 * the work on its own.
 */
export function VerdictHeader({ report }: { report: BuildingReport }) {
  const theme = GRADE_THEME[report.grade];
  const isClean = report.grade === 'A' && report.stats.openViolations === 0;

  return (
    <header className="px-5 pb-2 pt-6">
      <Link
        href="/"
        className="inline-flex min-h-[36px] items-center text-sm font-medium text-blue-700 hover:text-blue-800"
      >
        &larr; New search
      </Link>

      <div className={cn('mt-4 rounded-2xl px-5 py-6 ring-1 ring-inset', theme.bg, theme.ring)}>
        <div className="flex items-center gap-5">
          <span
            className={cn('text-7xl font-semibold leading-none tracking-tight', theme.fg)}
            aria-hidden="true"
          >
            {report.grade}
          </span>
          <span className="min-w-0">
            <span className={cn('block text-2xl font-semibold tabular-nums', theme.fg)}>
              {report.score}
              <span className="text-base font-medium text-slate-500">/100</span>
            </span>
            <span className="mt-1 block text-sm font-medium text-slate-700">
              {theme.descriptor}
            </span>
          </span>
        </div>
        <p className="sr-only">
          Grade {report.grade}. Score {report.score} out of 100. {theme.descriptor}.
        </p>
      </div>

      {isClean ? (
        <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 ring-1 ring-inset ring-emerald-200">
          No open violations on record. This building&rsquo;s public record is clean.
        </p>
      ) : null}

      <h1 className="mt-5 text-xl font-semibold leading-snug tracking-tight text-slate-900">
        {report.address}
      </h1>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-slate-500">Units</dt>
          <dd className="font-medium tabular-nums text-slate-900">
            {report.unitCount ?? 'Not on file'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Year built</dt>
          <dd className="font-medium tabular-nums text-slate-900">
            {report.yearBuilt ?? 'Not on file'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Borough</dt>
          <dd className="font-medium text-slate-900">{report.borough}</dd>
        </div>
        <div>
          <dt className="text-slate-500">BBL</dt>
          <dd className="font-medium tabular-nums text-slate-900">{report.bbl}</dd>
        </div>
      </dl>
    </header>
  );
}
