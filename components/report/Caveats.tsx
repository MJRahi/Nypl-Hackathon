import type { BuildingReport } from '@/lib/types';
import { formatTimestamp } from '@/components/report/reportFormat';

/**
 * Always visible, never collapsed. Under-reporting is the single biggest way this
 * page can mislead someone, so it is stated plainly rather than buried.
 */
export function Caveats({ report }: { report: BuildingReport }) {
  const { warnings } = report.dataQuality;

  return (
    <section className="border-t border-slate-200 px-5 py-8">
      <h2 className="text-sm font-semibold text-slate-900">Before you rely on this</h2>

      <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-slate-600">
        <li>
          This reflects complaints and violations that were <strong>filed with the city</strong>.
          Many problems are never reported, so a quiet record is not proof of a well-run building.
        </li>
        <li>
          These are public records, summarized. This is <strong>not legal advice</strong>, and it is
          not a substitute for seeing the apartment.
        </li>
        {report.dataQuality.unitCountKnown ? null : (
          <li>
            The unit count for this building isn&rsquo;t on file, so per-unit comparisons are
            unavailable.
          </li>
        )}
        {report.dataQuality.matchedBin ? null : (
          <li>
            We couldn&rsquo;t match a building identifier (BIN) for this address, so DOB records may
            be incomplete.
          </li>
        )}
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
        <li className="pt-1 text-slate-500">
          City data as of {formatTimestamp(report.dataAsOf)}.
        </li>
      </ul>
    </section>
  );
}
