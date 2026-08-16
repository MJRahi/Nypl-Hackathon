'use client';

import { useEffect, useRef, useState } from 'react';
import type { Category, CategoryStat, ErrorCode, RecordDetail } from '@/lib/types';
import { SOURCE_META, formatDate } from '@/components/report/reportFormat';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/components/ui/cn';

type RecordSource = RecordDetail['source'];

export interface DrawerRequest {
  /** Bumped on every open so the fetch effect re-runs even if bbl/title repeat. */
  token: number;
  title: string;
  /** null = all four datasets (used by category/pattern drill-down). */
  source: RecordSource | null;
  category: Category | null;
  statusFilter: 'open' | 'closed' | null;
  classFilter: 'A' | 'B' | 'C' | null;
  /** Pre-apply the last-24-months filter (used by the "24 months" stat tile). */
  within24mo: boolean;
}

const SOURCE_OPTIONS: { value: RecordSource; label: string }[] = [
  { value: 'HPD_COMPLAINT', label: 'HPD complaints' },
  { value: 'HPD_VIOLATION', label: 'HPD violations' },
  { value: 'DOB_COMPLAINT', label: 'DOB complaints' },
  { value: 'DOB_VIOLATION', label: 'DOB violations' },
];

interface MetricDrawerProps {
  request: DrawerRequest | null;
  onClose: () => void;
  bbl: string;
  dataAsOf: string;
  categories: CategoryStat[];
}

type FetchStatus = 'loading' | 'ready' | 'error';
type Sort = 'newest' | 'oldest';

const ERROR_COPY: Record<ErrorCode, { title: string; message: string }> = {
  RATE_LIMITED: {
    title: 'Too many requests right now',
    message: 'NYC Open Data is asking us to slow down. Wait a moment and try again.',
  },
  UPSTREAM_DOWN: {
    title: "Records aren't loading right now",
    message: 'This is on our end, not yours. Try again in a moment.',
  },
  BAD_INPUT: { title: 'Something went wrong', message: 'Try closing and reopening this panel.' },
  NOT_FOUND: { title: 'No records found', message: 'This building has no matching records on file.' },
};

function cutoff24moFrom(dataAsOf: string): string {
  const d = new Date(dataAsOf);
  d.setUTCFullYear(d.getUTCFullYear() - 2);
  return d.toISOString().slice(0, 10);
}

function RecordRow({
  record,
  expanded,
  onToggleExpand,
}: {
  record: RecordDetail;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const [explainState, setExplainState] = useState<
    { status: 'idle' } | { status: 'loading' } | { status: 'ready'; text: string } | { status: 'unavailable' }
  >({ status: 'idle' });
  const isOpen = record.status === 'open';
  const source = SOURCE_META[record.source];

  async function explain() {
    setExplainState({ status: 'loading' });
    try {
      const response = await fetch('/api/record-explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          record: {
            source: record.source,
            category: record.category,
            status: record.status,
            className: record.className,
            date: record.date,
            description: record.description,
          },
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const explanation =
        payload && typeof payload === 'object' && 'explanation' in payload
          ? (payload as { explanation?: unknown }).explanation
          : null;
      setExplainState(
        typeof explanation === 'string' && explanation.trim()
          ? { status: 'ready', text: explanation }
          : { status: 'unavailable' },
      );
    } catch {
      setExplainState({ status: 'unavailable' });
    }
  }

  return (
    <li className={cn('rounded-2xl bg-white p-3 ring-1 ring-inset', isOpen ? 'ring-red-200' : 'ring-slate-200')}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
            isOpen ? 'bg-red-50 text-red-800 ring-red-200' : 'bg-slate-100 text-slate-600 ring-slate-200',
          )}
        >
          {isOpen ? 'Open' : 'Closed'}
        </span>
        <span className="text-[11px] font-medium text-slate-500">{source.label}</span>
        {record.className ? (
          <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">
            Class {record.className}
          </span>
        ) : null}
        <span className="ml-auto text-[11px] tabular-nums text-slate-500">{formatDate(record.date)}</span>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-slate-900">{record.description}</p>

      <button
        type="button"
        onClick={onToggleExpand}
        className="mt-2 text-xs font-semibold text-blue-700 underline underline-offset-2"
        aria-expanded={expanded}
      >
        {expanded ? 'Hide full details' : 'View full details'}
      </button>

      {expanded ? (
        <div className="mt-2 space-y-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
          <dl className="space-y-1">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Record ID</dt>
              <dd className="font-medium tabular-nums">{record.id}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Unit</dt>
              <dd className="font-medium">{record.unit ?? 'Not available'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="shrink-0 text-slate-500">Dataset</dt>
              <dd className="min-w-0 truncate text-right font-medium">{source.label}</dd>
            </div>
          </dl>

          <a
            href={record.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block font-semibold text-blue-700 underline underline-offset-2"
          >
            View the official record &rarr;
          </a>

          <div className="border-t border-slate-200 pt-2">
            {explainState.status === 'idle' ? (
              <button
                type="button"
                onClick={() => void explain()}
                className="font-semibold text-blue-700 underline underline-offset-2"
              >
                What does this mean?
              </button>
            ) : explainState.status === 'loading' ? (
              <Skeleton className="h-8 w-full" />
            ) : explainState.status === 'ready' ? (
              <p className="leading-relaxed text-slate-700">{explainState.text}</p>
            ) : (
              <p className="italic text-slate-400">Explanation unavailable right now.</p>
            )}
          </div>
        </div>
      ) : null}
    </li>
  );
}

/**
 * Right-side drawer (desktop) / bottom sheet (mobile) showing the real NYC
 * records behind whatever metric was clicked. Fetches
 * GET /api/building/records itself — that endpoint is deliberately not part
 * of the main report payload. A native <dialog> supplies focus trapping and
 * Escape-to-close; see app/globals.css's .drawer-dialog for the layout.
 */
export function MetricDrawer({ request, onClose, bbl, dataAsOf, categories }: MetricDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const open = request !== null;

  const [records, setRecords] = useState<RecordDetail[]>([]);
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>('loading');
  const [errorCode, setErrorCode] = useState<ErrorCode>('UPSTREAM_DOWN');

  const [sourceFilter, setSourceFilter] = useState<RecordSource | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<Category | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [classFilter, setClassFilter] = useState<'all' | 'A' | 'B' | 'C'>('all');
  const [within24mo, setWithin24mo] = useState(false);
  const [sort, setSort] = useState<Sort>('newest');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Open/close the native dialog and manage focus.
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

  // Lock background scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Reset filters and fetch fresh records for every new request.
  useEffect(() => {
    if (!request) return;
    setSourceFilter(request.source ?? 'all');
    setCategoryFilter(request.category ?? 'all');
    setStatusFilter(request.statusFilter ?? 'all');
    setClassFilter(request.classFilter ?? 'all');
    setWithin24mo(request.within24mo);
    setSort('newest');
    setExpandedId(null);

    setFetchStatus('loading');
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/building/records?bbl=${encodeURIComponent(bbl)}`, {
          signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => null);

        if (payload && typeof payload === 'object' && 'error' in payload) {
          const err = (payload as { error: { code?: string } }).error;
          const code = typeof err?.code === 'string' ? err.code : 'UPSTREAM_DOWN';
          setErrorCode(code in ERROR_COPY ? (code as ErrorCode) : 'UPSTREAM_DOWN');
          setFetchStatus('error');
          return;
        }
        if (!response.ok || typeof payload !== 'object' || payload === null) {
          setErrorCode('UPSTREAM_DOWN');
          setFetchStatus('error');
          return;
        }
        const recs = (payload as { records?: unknown }).records;
        if (!Array.isArray(recs)) {
          setErrorCode('UPSTREAM_DOWN');
          setFetchStatus('error');
          return;
        }
        setRecords(recs as RecordDetail[]);
        setFetchStatus('ready');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setErrorCode('UPSTREAM_DOWN');
        setFetchStatus('error');
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.token, bbl]);

  const cutoff = cutoff24moFrom(dataAsOf);

  let visible = records;
  if (sourceFilter !== 'all') visible = visible.filter((r) => r.source === sourceFilter);
  if (categoryFilter !== 'all') visible = visible.filter((r) => r.category === categoryFilter);
  if (statusFilter !== 'all') visible = visible.filter((r) => r.status === statusFilter);
  if (classFilter !== 'all') visible = visible.filter((r) => r.className === classFilter);
  if (within24mo) visible = visible.filter((r) => r.date >= cutoff);
  visible = [...visible].sort((a, b) => {
    const cmp = a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    return sort === 'newest' ? -cmp : cmp;
  });

  return (
    <dialog
      ref={dialogRef}
      className="drawer-dialog"
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      onClose={onClose}
      aria-label={request?.title ?? 'Records'}
    >
      <div
        className="flex h-full max-h-[85vh] flex-col bg-white sm:max-h-screen"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">{request?.title ?? ''}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
          >
            &times;
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-3">
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as RecordSource | 'all')}
            className="rounded-lg border-0 bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-700"
            aria-label="Filter by dataset"
          >
            <option value="all">All datasets</option>
            {SOURCE_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as Category | 'all')}
            className="rounded-lg border-0 bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-700"
            aria-label="Filter by category"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'open' | 'closed')}
            className="rounded-lg border-0 bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-700"
            aria-label="Filter by status"
          >
            <option value="all">Open + closed</option>
            <option value="open">Open only</option>
            <option value="closed">Closed only</option>
          </select>

          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value as 'all' | 'A' | 'B' | 'C')}
            className="rounded-lg border-0 bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-700"
            aria-label="Filter by violation class"
          >
            <option value="all">Any class</option>
            <option value="A">Class A</option>
            <option value="B">Class B</option>
            <option value="C">Class C</option>
          </select>

          <button
            type="button"
            onClick={() => setSort((s) => (s === 'newest' ? 'oldest' : 'newest'))}
            className="rounded-lg bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-700"
          >
            {sort === 'newest' ? 'Newest first' : 'Oldest first'}
          </button>

          <label className="ml-auto flex items-center gap-1.5 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={within24mo}
              onChange={(e) => setWithin24mo(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-700"
            />
            Last 24mo
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {fetchStatus === 'loading' ? (
            <div className="space-y-3" role="status" aria-label="Loading records">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : fetchStatus === 'error' ? (
            <div className="rounded-2xl bg-white p-4 ring-1 ring-inset ring-slate-200">
              <p className="text-sm font-semibold text-slate-900">{ERROR_COPY[errorCode].title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{ERROR_COPY[errorCode].message}</p>
            </div>
          ) : visible.length === 0 ? (
            <p className="rounded-2xl bg-white p-4 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">
              {records.length === 0
                ? 'No records on file for this building.'
                : 'No records match these filters. Try clearing one.'}
            </p>
          ) : (
            <ul className="space-y-3">
              {visible.map((record) => (
                <RecordRow
                  key={record.id}
                  record={record}
                  expanded={expandedId === record.id}
                  onToggleExpand={() => setExpandedId((id) => (id === record.id ? null : record.id))}
                />
              ))}
            </ul>
          )}

          {fetchStatus === 'ready' ? (
            <p className="mt-4 text-[11px] text-slate-400">
              Showing the {records.length} most recent record{records.length === 1 ? '' : 's'} on file —{' '}
              {visible.length} match{visible.length === 1 ? 'es' : ''} the current filters.
            </p>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
