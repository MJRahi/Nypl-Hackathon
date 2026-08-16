'use client';

import { useEffect, useState } from 'react';
import type { BuildingReport } from '@/lib/types';
import { Section } from '@/components/ui/Section';
import { Skeleton } from '@/components/ui/Skeleton';

type Narrative = NonNullable<BuildingReport['narrative']>;

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; narrative: Narrative }
  /** Any failure at all: the section disappears. The page stands without it. */
  | { kind: 'hidden' };

function isNarrative(value: unknown): value is Narrative {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Narrative;
  return (
    typeof candidate.summary === 'string' &&
    candidate.summary.trim().length > 0 &&
    Array.isArray(candidate.redFlags) &&
    candidate.redFlags.every((item) => typeof item === 'string') &&
    Array.isArray(candidate.questionsToAsk) &&
    candidate.questionsToAsk.every((item) => typeof item === 'string')
  );
}

/**
 * Interpretation, last on the page and last to load. The request body carries
 * aggregates only — no address, no BBL, no raw record text — and the model is
 * never asked to produce a number we display.
 */
export function NarrativeSection({ report }: { report: BuildingReport }) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch('/api/narrative', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            grade: report.grade,
            score: report.score,
            unitCount: report.unitCount,
            yearBuilt: report.yearBuilt,
            stats: report.stats,
            categories: report.categories,
            bedbug: report.bedbug,
          }),
        });

        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok || typeof payload !== 'object' || payload === null) {
          setState({ kind: 'hidden' });
          return;
        }

        const narrative = (payload as { narrative?: unknown }).narrative;
        setState(isNarrative(narrative) ? { kind: 'ready', narrative } : { kind: 'hidden' });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ kind: 'hidden' });
      }
    })();

    return () => controller.abort();
  }, [report]);

  if (state.kind === 'hidden') return null;

  if (state.kind === 'loading') {
    return (
      <Section title="What should a renter know?" caption="Reading the record above.">
        <div className="space-y-3" role="status" aria-label="Loading analysis">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Section>
    );
  }

  return (
    <Section
      title="What should a renter know?"
      caption="AI-written summary of the records above. The numbers come from the city data, not the model."
    >
      <div className="space-y-5">
        <p className="text-sm leading-relaxed text-slate-800">{state.narrative.summary}</p>

        {state.narrative.redFlags.length > 0 ? (
          <div className="rounded-2xl bg-white p-4 ring-1 ring-inset ring-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">Red flags</h3>
            <ul className="mt-3 space-y-2.5">
              {state.narrative.redFlags.map((flag) => (
                <li key={flag} className="flex gap-2.5 text-sm leading-relaxed text-slate-700">
                  <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" />
                  <span>{flag}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {state.narrative.questionsToAsk.length > 0 ? (
          <QuestionChecklist questions={state.narrative.questionsToAsk} />
        ) : null}
      </div>
    </Section>
  );
}

/** Tickable at a viewing. State is in-memory only — no localStorage anywhere. */
function QuestionChecklist({ questions }: { questions: string[] }) {
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
    <div className="rounded-2xl bg-white p-4 ring-1 ring-inset ring-slate-200">
      <h3 className="text-sm font-semibold text-slate-900">Ask before you sign</h3>
      <ul className="mt-3 space-y-1">
        {questions.map((question, index) => (
          <li key={question}>
            <label className="flex min-h-[44px] cursor-pointer items-start gap-3 py-1.5">
              <input
                type="checkbox"
                checked={checked.has(index)}
                onChange={() => toggle(index)}
                className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-blue-700 focus:ring-blue-700"
              />
              <span
                className={
                  checked.has(index)
                    ? 'text-sm leading-relaxed text-slate-400 line-through'
                    : 'text-sm leading-relaxed text-slate-700'
                }
              >
                {question}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
