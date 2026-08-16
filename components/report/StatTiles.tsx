import type { BuildingReport } from '@/lib/types';
import { ComparisonBar } from '@/components/report/ComparisonBar';
import { cn } from '@/components/ui/cn';

interface Tile {
  label: string;
  value: number;
  /** Class C is the city's immediately-hazardous tier — it earns emphasis when non-zero. */
  alarming?: boolean;
}

function StatTile({ tile, className }: { tile: Tile; className?: string }) {
  const hot = Boolean(tile.alarming) && tile.value > 0;
  return (
    <div
      className={cn(
        'rounded-2xl bg-white p-4 ring-1 ring-inset',
        hot ? 'ring-red-200' : 'ring-slate-200',
        className,
      )}
    >
      <p
        className={cn(
          'text-3xl font-semibold leading-none tabular-nums',
          hot ? 'text-red-700' : 'text-slate-900',
        )}
      >
        {tile.value}
      </p>
      <p className="mt-2 text-xs font-medium leading-snug text-slate-500">{tile.label}</p>
    </div>
  );
}

export function StatTiles({ report }: { report: BuildingReport }) {
  const { stats } = report;

  // Exactly the five tiles the spec calls for, in that order.
  const tiles: Tile[] = [
    { label: 'HPD complaints, all time', value: stats.hpdComplaintsAllTime },
    { label: 'HPD complaints, last 24 months', value: stats.hpdComplaints24mo },
    { label: 'Open HPD violations', value: stats.openViolations },
    { label: 'Open class C — immediately hazardous', value: stats.classCViolations, alarming: true },
    { label: 'DOB complaints, last 24 months', value: stats.dobComplaints24mo },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((tile, index) => (
          <StatTile
            key={tile.label}
            tile={tile}
            // An odd count would leave a hole in a 2-up grid; the last tile
            // takes the full row instead of us inventing a sixth stat.
            className={
              tiles.length % 2 === 1 && index === tiles.length - 1 ? 'col-span-2' : undefined
            }
          />
        ))}
      </div>

      <ComparisonBar
        buildingRate={stats.complaintsPerUnitPerYear}
        cityMedian={stats.cityMedianPerUnitPerYear}
      />

      {report.bedbug.reported ? (
        <div className="rounded-2xl bg-red-50 p-4 ring-1 ring-inset ring-red-200">
          <p className="text-sm font-semibold text-red-900">Bedbug infestation on record</p>
          <p className="mt-1 text-sm leading-relaxed text-red-900/80">
            {report.bedbug.infestedUnits !== null ? (
              <>
                <span className="font-semibold tabular-nums">{report.bedbug.infestedUnits}</span>{' '}
                {report.bedbug.infestedUnits === 1 ? 'unit' : 'units'} reported
              </>
            ) : (
              'Filed with the city'
            )}
            {report.bedbug.year !== null ? <> in {report.bedbug.year}</> : null}. Landlords must file
            this annually under NYC law.
          </p>
        </div>
      ) : null}
    </div>
  );
}
