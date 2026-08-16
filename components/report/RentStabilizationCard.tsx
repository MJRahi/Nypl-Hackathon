'use client';

import { useEffect, useState } from 'react';
import type { RentRegulationSignal, RentRegulationVerdict } from '@/lib/nyc/rentStabilization';
import { Section } from '@/components/ui/Section';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/components/ui/cn';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; signal: RentRegulationSignal }
  /** Our own route failed. The section disappears; the report stands without it. */
  | { kind: 'hidden' };

const VERDICT_CHIP: Record<RentRegulationVerdict, string> = {
  possible: 'bg-amber-50 text-amber-900 ring-amber-200',
  unconfirmed: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const VERDICT_LABEL: Record<RentRegulationVerdict, string> = {
  possible: 'Possible match',
  unconfirmed: 'Not confirmed',
};

function isSignal(value: unknown): value is RentRegulationSignal {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as RentRegulationSignal;
  return (
    (candidate.verdict === 'possible' || candidate.verdict === 'unconfirmed') &&
    Array.isArray(candidate.reasons) &&
    candidate.reasons.every((item) => typeof item === 'string')
  );
}

/**
 * Rent stabilization, kept apart from the graded record above it. Nothing here
 * feeds the Walkthrough score, and the strongest claim the card is allowed to
 * make is that the building *may* contain stabilized units — the authoritative
 * answer for a specific apartment lives with DHCR, not in open data.
 */
export function RentStabilizationCard({ bbl }: { bbl: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(`/api/rent-regulation?bbl=${encodeURIComponent(bbl)}`, {
          signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok || typeof payload !== 'object' || payload === null) {
          setState({ kind: 'hidden' });
          return;
        }

        const signal = (payload as { signal?: unknown }).signal;
        setState(isSignal(signal) ? { kind: 'ready', signal } : { kind: 'hidden' });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ kind: 'hidden' });
      }
    })();

    return () => controller.abort();
  }, [bbl]);

  if (state.kind === 'hidden') return null;

  if (state.kind === 'loading') {
    return (
      <Section title="Rent stabilization" caption="Checking the city's records for this lot.">
        <div className="space-y-3" role="status" aria-label="Checking rent stabilization">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </Section>
    );
  }

  const { signal } = state;
  const isPossible = signal.verdict === 'possible';

  return (
    <Section
      title="Rent stabilization"
      caption="Read from building records, not from a rent registration. It is a lead to check, not an answer."
    >
      <div
        className={cn(
          'rounded-2xl bg-white p-4 ring-1 ring-inset ring-slate-200',
          isPossible && 'border-l-4 border-l-amber-500',
        )}
      >
        <span
          className={cn(
            'inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset',
            VERDICT_CHIP[signal.verdict],
          )}
        >
          {VERDICT_LABEL[signal.verdict]}
        </span>

        {isPossible ? (
          <>
            <p className="mt-3 text-sm font-medium leading-relaxed text-slate-900">
              This building may contain rent-stabilized apartments.
            </p>

            <BuildingFacts unitCount={signal.unitCount} yearBuilt={signal.yearBuilt} />

            {signal.reasons.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {signal.reasons.map((reason) => (
                  <li key={reason} className="flex gap-2.5 text-sm leading-relaxed text-slate-700">
                    <span
                      aria-hidden="true"
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                    />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            <p className="mt-4 border-t border-slate-200 pt-3 text-sm leading-relaxed text-slate-600">
              This does not confirm the status of this specific apartment. Verify the apartment’s
              official rent-regulation status before signing.
            </p>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm font-medium leading-relaxed text-slate-900">
              We couldn’t confirm whether this apartment is rent stabilized.
            </p>

            <BuildingFacts unitCount={signal.unitCount} yearBuilt={signal.yearBuilt} />

            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              Rent regulation can depend on factors that are not visible from basic building
              information.
            </p>

            <p className="mt-4 border-t border-slate-200 pt-3 text-sm leading-relaxed text-slate-600">
              Verify the apartment’s official rent history before signing.
            </p>
          </>
        )}

        <a
          href="https://portal.hcr.ny.gov/app/ask"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-sm font-medium text-blue-700 underline underline-offset-2"
        >
          Request the rent history from NY State HCR
        </a>
      </div>
    </Section>
  );
}

/** The two facts the verdict leans on. Omitted entirely when the city has neither. */
function BuildingFacts({
  unitCount,
  yearBuilt,
}: {
  unitCount: number | null;
  yearBuilt: number | null;
}) {
  if (unitCount === null && yearBuilt === null) return null;

  return (
    <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
      {unitCount !== null ? (
        <div className="flex items-baseline gap-1.5">
          <dd className="text-sm font-semibold tabular-nums text-slate-900">{unitCount}</dd>
          <dt className="text-sm text-slate-500">units</dt>
        </div>
      ) : null}
      {yearBuilt !== null ? (
        <div className="flex items-baseline gap-1.5">
          <dt className="text-sm text-slate-500">Built</dt>
          <dd className="text-sm font-semibold tabular-nums text-slate-900">{yearBuilt}</dd>
        </div>
      ) : null}
    </dl>
  );
}
