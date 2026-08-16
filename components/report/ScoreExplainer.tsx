'use client';

import { useEffect, useRef, useState } from 'react';
import type { ScoreBreakdown } from '@/lib/types';
import { cn } from '@/components/ui/cn';

interface ScoreExplainerProps {
  breakdown: ScoreBreakdown;
  score: number;
  className?: string;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

interface Line {
  label: string;
  detail: string;
  amount: number;
}

function buildLines(b: ScoreBreakdown): Line[] {
  const lines: Line[] = [
    { label: 'Starting score', detail: 'Every building starts here.', amount: b.start },
  ];

  if (b.classCCount > 0) {
    lines.push({
      label: `${b.classCCount} open class C violation${b.classCCount === 1 ? '' : 's'}`,
      detail: "The city's immediately-hazardous tier — 12 points each, capped at 40.",
      amount: -b.classCPenalty,
    });
  }
  if (b.classBCount > 0) {
    lines.push({
      label: `${b.classBCount} open class B violation${b.classBCount === 1 ? '' : 's'}`,
      detail: '4 points each, capped at 20.',
      amount: -b.classBPenalty,
    });
  }
  if (b.complaintCount > 0) {
    const scaling =
      b.unitScaleFactor !== null
        ? `then scaled by this building's unit count (×${round(b.unitScaleFactor)})`
        : "unit count isn't known, so no per-building scaling was applied";
    lines.push({
      label: `${b.complaintCount} HPD complaint${b.complaintCount === 1 ? '' : 's'} in 24 months`,
      detail: `1 point each, capped at 25, ${scaling}.`,
      amount: -round(b.complaintPenalty),
    });
  }
  if (b.bedbugReported) {
    lines.push({
      label: 'Bedbug infestation reported within 2 years',
      detail: 'A flat deduction.',
      amount: -b.bedbugPenalty,
    });
  }
  if (b.cleanBonus > 0) {
    lines.push({
      label: 'Zero open violations',
      detail: 'A flat bonus for a clean current record.',
      amount: b.cleanBonus,
    });
  }

  return lines;
}

/**
 * "Why this score?" — the exact line items computeScore() computed in
 * lib/nyc/aggregate.ts, not a re-derived client-side approximation. Same
 * native-<dialog> drawer pattern as MetricDrawer.
 */
export function ScoreExplainer({ breakdown, score, className }: ScoreExplainerProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
      previousFocusRef.current?.focus();
    }
  }, [open]);

  const lines = buildLines(breakdown);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'text-xs font-semibold text-blue-700 underline underline-offset-2',
          className,
        )}
      >
        Why this score?
      </button>

      <dialog
        ref={dialogRef}
        className="drawer-dialog"
        onClick={(event) => {
          if (event.target === dialogRef.current) setOpen(false);
        }}
        onClose={() => setOpen(false)}
        aria-label="Why this score"
      >
        <div
          className="flex h-full max-h-[85vh] flex-col bg-white sm:max-h-screen"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Why this score?</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            >
              &times;
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <p className="text-xs leading-relaxed text-slate-500">
              The same deterministic formula, applied to this building's real numbers — no model
              involved.
            </p>

            <ul className="mt-4 space-y-3">
              {lines.map((line) => (
                <li key={line.label} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{line.label}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{line.detail}</p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 text-sm font-semibold tabular-nums',
                      line.amount > 0 ? 'text-emerald-700' : line.amount < 0 ? 'text-red-700' : 'text-slate-500',
                    )}
                  >
                    {line.amount > 0 ? '+' : ''}
                    {round(line.amount)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
              <span className="text-sm font-semibold text-slate-900">Final score</span>
              <span className="text-lg font-semibold tabular-nums text-slate-900">{score}/100</span>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Clamped to 0–100. Raw total before clamping: {round(breakdown.rawTotal)}.
            </p>
          </div>
        </div>
      </dialog>
    </>
  );
}
