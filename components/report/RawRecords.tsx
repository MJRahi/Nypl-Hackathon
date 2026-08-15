import type { BuildingReport } from '@/lib/types';
import { SOURCE_META, formatDate, pinOpenFirst } from '@/components/report/reportFormat';

/**
 * The trust anchor. Anyone skeptical of the grade can open this, read the raw rows,
 * and click straight through to the city dataset each one came from.
 */
export function RawRecords({ report }: { report: BuildingReport }) {
  const rows = pinOpenFirst(report.timeline);
  const sourceByDataset = new Map(report.sources.map((source) => [source.datasetId, source]));

  return (
    <details className="group rounded-2xl bg-white ring-1 ring-inset ring-slate-200">
      <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 text-sm font-semibold text-slate-900">
        See the raw records
        <span className="text-xs font-normal text-slate-500 group-open:hidden">
          {rows.length} rows
        </span>
      </summary>

      <div className="border-t border-slate-200 px-4 py-4">
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[560px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th scope="col" className="py-2 pr-3 font-medium">Date</th>
                <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                <th scope="col" className="py-2 pr-3 font-medium">Class</th>
                <th scope="col" className="py-2 pr-3 font-medium">Description</th>
                <th scope="col" className="py-2 font-medium">Dataset</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((event, index) => {
                const meta = SOURCE_META[event.source];
                const source = sourceByDataset.get(meta.datasetId);
                return (
                  <tr
                    key={`${event.date}-${event.source}-${index}`}
                    className="border-b border-slate-100 align-top"
                  >
                    <td className="py-2 pr-3 tabular-nums text-slate-700">
                      {formatDate(event.date)}
                    </td>
                    <td className="py-2 pr-3 text-slate-700">
                      {event.status === 'open' ? 'Open' : 'Closed'}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-slate-700">
                      {event.className ?? '—'}
                    </td>
                    <td className="py-2 pr-3 text-slate-900">{event.description}</td>
                    <td className="py-2 text-slate-700">
                      {source ? (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-800"
                        >
                          {source.name}
                        </a>
                      ) : (
                        meta.label
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <h3 className="mt-6 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Datasets used
        </h3>
        <ul className="mt-2 space-y-1.5">
          {report.sources.map((source) => (
            <li key={source.datasetId} className="text-xs">
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-800"
              >
                {source.name}
              </a>
              <span className="text-slate-500"> · {source.datasetId}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
