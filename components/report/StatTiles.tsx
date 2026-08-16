import type { BuildingReport } from '@/lib/types';
import type { DrawerRequest } from '@/components/report/MetricDrawer';
import { ComparisonBar } from '@/components/report/ComparisonBar';
import { cn } from '@/components/ui/cn';

interface Tile {
  label: string;
  value: number;
  /** Class C is the city's immediately-hazardous tier — it earns emphasis when non-zero. */
  alarming?: boolean;
  drawer: Omit<DrawerRequest, 'token'>;
}

function StatTile({
  tile,
  className,
  onOpenDrawer,
}: {
  tile: Tile;
  className?: string;
  onOpenDrawer: (request: Omit<DrawerRequest, 'token'>) => void;
}) {
  const hot = Boolean(tile.alarming) && tile.value > 0;
  return (
    <button
      type="button"
      onClick={() => onOpenDrawer(tile.drawer)}
      className={cn(
        'rounded-2xl bg-white p-4 text-left ring-1 ring-inset transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700',
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
      <p className="mt-1.5 text-[11px] font-semibold text-blue-700">View details &rarr;</p>
    </button>
  );
}

interface StatTilesProps {
  report: BuildingReport;
  onOpenDrawer: (request: Omit<DrawerRequest, 'token'>) => void;
}

export function StatTiles({ report, onOpenDrawer }: StatTilesProps) {
  const { stats } = report;

  // Exactly the five tiles the spec calls for, in that order.
  const tiles: Tile[] = [
    {
      label: 'HPD complaints, all time',
      value: stats.hpdComplaintsAllTime,
      drawer: {
        title: 'HPD complaints, all time',
        source: 'HPD_COMPLAINT',
        category: null,
        statusFilter: null,
        classFilter: null,
        within24mo: false,
      },
    },
    {
      label: 'HPD complaints, last 24 months',
      value: stats.hpdComplaints24mo,
      drawer: {
        title: 'HPD complaints, last 24 months',
        source: 'HPD_COMPLAINT',
        category: null,
        statusFilter: null,
        classFilter: null,
        within24mo: true,
      },
    },
    {
      label: 'Open HPD violations',
      value: stats.openViolations,
      drawer: {
        title: 'Open HPD violations',
        source: 'HPD_VIOLATION',
        category: null,
        statusFilter: 'open',
        classFilter: null,
        within24mo: false,
      },
    },
    {
      label: 'Open class C — immediately hazardous',
      value: stats.classCViolations,
      alarming: true,
      drawer: {
        title: 'Open class C violations',
        source: 'HPD_VIOLATION',
        category: null,
        statusFilter: 'open',
        classFilter: 'C',
        within24mo: false,
      },
    },
    {
      label: 'DOB complaints, last 24 months',
      value: stats.dobComplaints24mo,
      drawer: {
        title: 'DOB complaints, last 24 months',
        source: 'DOB_COMPLAINT',
        category: null,
        statusFilter: null,
        classFilter: null,
        within24mo: false,
      },
    },
  ];

  return (
    <div className="space-y-4">
      {/* Six columns is the trick that makes five tiles fill a wide row exactly:
          three at two columns, then two at three. A 3-up grid would leave a hole. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {tiles.map((tile, index) => (
          <StatTile
            key={tile.label}
            tile={tile}
            onOpenDrawer={onOpenDrawer}
            className={cn(
              // An odd count would leave a hole in a 2-up grid; the last tile
              // takes the full row instead of us inventing a sixth stat.
              tiles.length % 2 === 1 && index === tiles.length - 1 && 'col-span-2',
              index < 3 ? 'md:col-span-2' : 'md:col-span-3',
            )}
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
