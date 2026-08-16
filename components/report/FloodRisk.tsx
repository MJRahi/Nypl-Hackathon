'use client';

import { useEffect, useState } from 'react';
import type { BuildingReport } from '@/lib/types';
import { Section } from '@/components/ui/Section';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/components/ui/cn';

type FloodLevel = 'low' | 'potential' | 'higher' | 'unavailable';

interface FloodRiskData {
  level: FloodLevel;
  headline: string;
  findings: string[];
  questions: string[];
  sources: { name: string; url: string }[];
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; flood: FloodRiskData }
  | { kind: 'unavailable' };

const LEVEL_COPY: Record<
  Exclude<FloodLevel, 'unavailable'>,
  { label: string; badge: string; panel: string }
> = {
  higher: {
    label: 'Higher exposure',
    badge: 'bg-red-50 text-red-800 ring-red-200',
    panel: 'bg-red-50/60 ring-red-100',
  },
  potential: {
    label: 'Potential exposure',
    badge: 'bg-amber-50 text-amber-900 ring-amber-200',
    panel: 'bg-amber-50/60 ring-amber-100',
  },
  low: {
    label: 'No known signal',
    badge: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    panel: 'bg-emerald-50/60 ring-emerald-100',
  },
};

function isFloodRisk(value: unknown): value is FloodRiskData {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as FloodRiskData;
  return (
    (candidate.level === 'low' ||
      candidate.level === 'potential' ||
      candidate.level === 'higher' ||
      candidate.level === 'unavailable') &&
    typeof candidate.headline === 'string' &&
    Array.isArray(candidate.findings) &&
    Array.isArray(candidate.questions) &&
    Array.isArray(candidate.sources)
  );
}

/**
 * Flood exposure for the building's coordinates. Deliberately independent of the
 * report: it has its own fetch and its own failure state, so flood mapping being
 * down cannot affect the grade, the score, or anything above it.
 */
export function FloodRisk({ report }: { report: BuildingReport }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const { lat, lng } = report;

  useEffect(() => {
    // The report uses 0/0 when the lot has no coordinate, which we cannot query.
    if (lat === 0 || lng === 0) {
      setState({ kind: 'unavailable' });
      return;
    }

    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(`/api/flood-risk?lat=${lat}&lng=${lng}`, {
          signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok || typeof payload !== 'object' || payload === null) {
          setState({ kind: 'unavailable' });
          return;
        }

        const flood = (payload as { flood?: unknown }).flood;
        if (!isFloodRisk(flood) || flood.level === 'unavailable') {
          setState({ kind: 'unavailable' });
          return;
        }

        setState({ kind: 'ready', flood });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ kind: 'unavailable' });
      }
    })();

    return () => controller.abort();
  }, [lat, lng]);

  if (state.kind === 'loading') {
    return (
      <Section title="Flood exposure" caption="Checking public NYC flood mapping for this location.">
        <div className="space-y-3" role="status" aria-label="Checking flood mapping">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </Section>
    );
  }

  if (state.kind === 'unavailable') {
    return (
      <Section title="Flood exposure">
        <div className="rounded-2xl bg-white p-4 ring-1 ring-inset ring-slate-200">
          <p className="text-sm font-semibold text-slate-900">Flood data unavailable</p>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
            We couldn&rsquo;t check NYC flood mapping for this address right now. That is not a
            signal either way &mdash; it&rsquo;s still worth asking whether the building has ever
            taken on water.
          </p>
        </div>
      </Section>
    );
  }

  const { flood } = state;
  const copy = LEVEL_COPY[flood.level as Exclude<FloodLevel, 'unavailable'>];
  const hasQuestions = flood.questions.length > 0;

  return (
    <Section
      title="Flood exposure"
      caption="From NYC's published flood mapping for this location, not from this building's complaint record."
    >
      <div className="space-y-4">
        <div className={cn('rounded-2xl p-4 ring-1 ring-inset', copy.panel)}>
          {/* Label carries the meaning; colour only reinforces it. */}
          <span
            className={cn(
              'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
              copy.badge,
            )}
          >
            {copy.label}
          </span>
          <p className="mt-3 text-sm leading-relaxed text-slate-800">{flood.headline}</p>
        </div>

        {flood.findings.length > 0 ? (
          <ul className="space-y-2.5">
            {flood.findings.map((finding) => (
              <li key={finding} className="flex gap-2.5 text-sm leading-relaxed text-slate-700">
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400"
                />
                <span>{finding}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {hasQuestions ? <FloodQuestions questions={flood.questions} /> : null}

        {flood.sources.length > 0 ? (
          <ul className="space-y-1.5 border-t border-slate-200 pt-3">
            {flood.sources.map((source) => (
              <li key={source.url} className="text-xs leading-relaxed">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-700 underline underline-offset-2"
                >
                  {source.name}
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        <p className="text-xs leading-relaxed text-slate-500">
          Flood mapping describes the area around a property, not a prediction about any single
          apartment. Ask the questions above rather than assuming either way.
        </p>
      </div>
    </Section>
  );
}

/**
 * Nothing in the frozen report says which floor a unit is on, so the renter tells
 * us. Ground and basement units are where these questions matter most, and the
 * person holding the phone is standing in the apartment.
 */
function FloodQuestions({ questions }: { questions: string[] }) {
  const [lowFloor, setLowFloor] = useState(false);
  const [checked, setChecked] = useState<ReadonlySet<number>>(new Set());

  function toggle(index: number) {
    setChecked((previous) => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div
      className={cn(
        'rounded-2xl bg-white p-4 ring-1 ring-inset',
        lowFloor ? 'ring-2 ring-amber-300' : 'ring-slate-200',
      )}
    >
      <h3 className="text-sm font-semibold text-slate-900">Ask at the viewing</h3>

      {/* A control, not a sixth question — kept visually separate from the list. */}
      <button
        type="button"
        aria-pressed={lowFloor}
        onClick={() => setLowFloor((value) => !value)}
        className={cn(
          'mt-3 flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-medium ring-1 ring-inset transition-colors',
          lowFloor
            ? 'bg-amber-100 text-amber-900 ring-amber-300'
            : 'bg-slate-50 text-slate-600 ring-slate-200',
        )}
      >
        <span>Seeing a basement or ground-floor unit?</span>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
            lowFloor
              ? 'bg-amber-900 text-amber-50 ring-amber-900'
              : 'bg-white text-slate-500 ring-slate-300',
          )}
        >
          {lowFloor ? 'Yes' : 'No'}
        </span>
      </button>

      {lowFloor ? (
        <p className="mt-2.5 text-xs font-medium leading-relaxed text-amber-900">
          Basement and ground-floor units take on water first. Get an answer to every question
          below before you sign.
        </p>
      ) : null}

      <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3">
        {questions.map((question, index) => (
          <li key={question}>
            <label
              className={cn(
                'flex min-h-[44px] items-start gap-2.5 py-1 leading-relaxed',
                lowFloor ? 'text-sm font-medium text-slate-900' : 'text-sm text-slate-700',
              )}
            >
              <input
                type="checkbox"
                checked={checked.has(index)}
                onChange={() => toggle(index)}
                className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-700"
              />
              <span className={checked.has(index) ? 'text-slate-400 line-through' : undefined}>
                {question}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
