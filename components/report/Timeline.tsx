'use client';

import { useState } from 'react';
import type { CategoryStat, TimelineEvent } from '@/lib/types';
import {
  SOURCE_META,
  categoryLabels,
  formatDate,
  humanizeCategory,
  pinOpenFirst,
} from '@/components/report/reportFormat';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';

const COLLAPSED_COUNT = 10;

interface TimelineProps {
  timeline: TimelineEvent[];
  /** Source of truth for category display names — never invent a label. */
  categories: CategoryStat[];
}

function EventRow({ event, label }: { event: TimelineEvent; label: string }) {
  const isOpen = event.status === 'open';
  const source = SOURCE_META[event.source];

  return (
    <li
      className={cn(
        'rounded-2xl bg-white p-4 ring-1 ring-inset',
        isOpen ? 'ring-red-200' : 'ring-slate-200',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
            isOpen
              ? 'bg-red-50 text-red-800 ring-red-200'
              : 'bg-slate-100 text-slate-600 ring-slate-200',
          )}
        >
          {isOpen ? 'Open' : 'Closed'}
        </span>
        <span className="text-[11px] font-medium text-slate-500">{source.label}</span>
        {event.className ? (
          <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">
            Class {event.className}
          </span>
        ) : null}
        <span className="ml-auto text-[11px] tabular-nums text-slate-500">
          {formatDate(event.date)}
        </span>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-slate-900">{event.description}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </li>
  );
}

export function Timeline({ timeline, categories }: TimelineProps) {
  const [expanded, setExpanded] = useState(false);

  const labels = categoryLabels(categories);
  const ordered = pinOpenFirst(timeline);
  const visible = expanded ? ordered : ordered.slice(0, COLLAPSED_COUNT);
  const hidden = ordered.length - visible.length;

  if (ordered.length === 0) {
    return (
      <p className="rounded-2xl bg-white p-4 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">
        No complaints or violations on record.
      </p>
    );
  }

  return (
    <div>
      <ul className="space-y-3">
        {visible.map((event, index) => (
          <EventRow
            key={`${event.date}-${event.source}-${index}`}
            event={event}
            label={labels.get(event.category) ?? humanizeCategory(event.category)}
          />
        ))}
      </ul>

      {hidden > 0 ? (
        <Button variant="secondary" className="mt-4 w-full" onClick={() => setExpanded(true)}>
          Show all {ordered.length} records
        </Button>
      ) : null}

      {expanded && ordered.length > COLLAPSED_COUNT ? (
        <Button variant="secondary" className="mt-4 w-full" onClick={() => setExpanded(false)}>
          Show fewer
        </Button>
      ) : null}
    </div>
  );
}
