'use client';

import { useState } from 'react';
import type { BuildingReport } from '@/lib/types';
import { GRADE_THEME, formatTimestamp } from '@/components/report/reportFormat';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';

interface ShareCardProps {
  report: BuildingReport;
  className?: string;
}

/** Plain text for the clipboard — no markdown, nothing that breaks in a text message. */
function buildShareText(report: BuildingReport): string {
  const narrative = report.narrative;
  const lines = [
    `Walkthrough — ${report.address}`,
    `Grade ${report.grade} (${report.score}/100)`,
  ];

  const redFlags = narrative?.redFlags.slice(0, 3) ?? [];
  if (redFlags.length > 0) {
    lines.push('', 'Top concerns:');
    redFlags.forEach((flag) => lines.push(`- ${flag}`));
  }

  const questions = narrative?.questionsToAsk ?? [];
  if (questions.length > 0) {
    lines.push('', 'Ask before you sign:');
    questions.forEach((question) => lines.push(`- ${question}`));
  }

  lines.push('', `City data as of ${formatTimestamp(report.dataAsOf)}.`);
  lines.push('Public record summary, not legal advice — nobody signs a lease alone.');

  return lines.join('\n');
}

/** Falls back to a hidden-textarea copy for browsers that block the Clipboard API. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * A screenshot-shaped summary someone forwards to a partner or parent before
 * signing. Fixed aspect ratio so it crops predictably as a message-thread
 * thumbnail; content is capped and clamped rather than left to overflow.
 */
export function ShareCard({ report, className }: ShareCardProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const theme = GRADE_THEME[report.grade];
  const narrative = report.narrative;
  const redFlags = narrative?.redFlags.slice(0, 3) ?? [];
  const questions = narrative?.questionsToAsk.slice(0, 3) ?? [];

  async function handleCopy() {
    const ok = await copyText(buildShareText(report));
    setCopyState(ok ? 'copied' : 'failed');
    setTimeout(() => setCopyState('idle'), 2000);
  }

  return (
    <div className={cn('mx-auto w-full max-w-[380px]', className)}>
      <div
        className={cn(
          'flex aspect-[4/5] w-full flex-col overflow-hidden rounded-3xl p-5 ring-1 ring-inset',
          theme.bg,
          theme.ring,
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Walkthrough
          </span>
          <span className="text-[11px] text-slate-500">
            {formatTimestamp(report.dataAsOf)}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <span
            className={cn('text-5xl font-semibold leading-none tracking-tight', theme.fg)}
            aria-hidden="true"
          >
            {report.grade}
          </span>
          <span className="min-w-0">
            <span className={cn('block text-xl font-semibold tabular-nums', theme.fg)}>
              {report.score}
              <span className="text-sm font-medium text-slate-500">/100</span>
            </span>
            <span className="block text-xs font-medium text-slate-700">{theme.descriptor}</span>
          </span>
        </div>

        <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-slate-900">
          {report.address}
        </p>

        {redFlags.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-2xl bg-white/80 p-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Top concerns
            </h3>
            <ul className="mt-1.5 space-y-1.5">
              {redFlags.map((flag) => (
                <li key={flag} className="flex gap-1.5 text-xs leading-snug text-slate-700">
                  <span
                    aria-hidden="true"
                    className="mt-1 h-1 w-1 shrink-0 rounded-full bg-red-600"
                  />
                  <span className="line-clamp-1">{flag}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mt-3 rounded-2xl bg-white/80 p-3">
            <p className="text-xs leading-snug text-slate-600">
              {report.stats.openViolations} open violation
              {report.stats.openViolations === 1 ? '' : 's'} on file with the city.
            </p>
          </div>
        )}

        {questions.length > 0 ? (
          <div className="mt-2 overflow-hidden rounded-2xl bg-white/80 p-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Ask before you sign
            </h3>
            <ul className="mt-1.5 space-y-1">
              {questions.map((question) => (
                <li key={question} className="flex gap-1.5 text-xs leading-snug text-slate-700">
                  <span aria-hidden="true" className="mt-px shrink-0 text-slate-400">
                    &#9744;
                  </span>
                  <span className="line-clamp-1">{question}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="mt-auto pt-2 text-[10px] leading-snug text-slate-500">
          Public record summary, not legal advice. Nobody signs a lease alone.
        </p>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500" role="status">
          {copyState === 'copied'
            ? 'Copied to clipboard.'
            : copyState === 'failed'
              ? "Couldn't copy — select and copy the text manually."
              : 'Screenshot the card above, or copy it as text.'}
        </p>
        <Button type="button" variant="secondary" onClick={handleCopy} className="shrink-0">
          {copyState === 'copied' ? 'Copied' : 'Copy summary'}
        </Button>
      </div>
    </div>
  );
}
