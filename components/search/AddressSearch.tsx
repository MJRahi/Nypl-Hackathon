'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AddressCandidate } from '@/lib/types';
import { cn } from '@/components/ui/cn';

/** Rate-limit requirement, not a nicety. Do not lower either of these. */
const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 300;

type SearchState =
  | { kind: 'idle' }
  | { kind: 'tooShort' }
  | { kind: 'loading' }
  | { kind: 'results'; candidates: AddressCandidate[] }
  | { kind: 'empty' }
  | { kind: 'error'; message: string };

const ERROR_COPY: Record<string, string> = {
  RATE_LIMITED: 'Too many lookups at once. Wait a moment and try again.',
  UPSTREAM_DOWN: "The city's address service isn't responding right now.",
  BAD_INPUT: "We couldn't read that address. Try a street number and street name.",
  NOT_FOUND: '',
};

function isAddressCandidateArray(value: unknown): value is AddressCandidate[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as AddressCandidate).label === 'string' &&
        typeof (item as AddressCandidate).bbl === 'string',
    )
  );
}

export function AddressSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>({ kind: 'idle' });
  const [highlighted, setHighlighted] = useState(0);
  const [open, setOpen] = useState(false);
  /** Bumped by "Try again" to re-run the lookup for the same query. */
  const [attempt, setAttempt] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length === 0) {
      setState({ kind: 'idle' });
      return;
    }
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setState({ kind: 'tooShort' });
      return;
    }

    setState({ kind: 'loading' });
    setOpen(true);

    let controller: AbortController | null = null;
    const timer = setTimeout(() => {
      controller = new AbortController();
      void (async () => {
        try {
          const response = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`, {
            signal: controller.signal,
          });

          // A missing or broken route returns HTML, not JSON — never let that throw raw.
          const payload: unknown = await response.json().catch(() => null);

          if (payload && typeof payload === 'object' && 'error' in payload) {
            const err = (payload as { error: { code?: string; message?: string } }).error;
            const code = typeof err?.code === 'string' ? err.code : 'UPSTREAM_DOWN';
            if (code === 'NOT_FOUND') {
              setState({ kind: 'empty' });
              return;
            }
            setState({
              kind: 'error',
              message: ERROR_COPY[code] || 'Something went wrong looking up that address.',
            });
            return;
          }

          if (!response.ok || !payload || typeof payload !== 'object') {
            setState({ kind: 'error', message: ERROR_COPY.UPSTREAM_DOWN });
            return;
          }

          const candidates = (payload as { candidates?: unknown }).candidates;
          if (!isAddressCandidateArray(candidates)) {
            setState({ kind: 'error', message: ERROR_COPY.UPSTREAM_DOWN });
            return;
          }

          setHighlighted(0);
          setState(candidates.length === 0 ? { kind: 'empty' } : { kind: 'results', candidates });
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          setState({ kind: 'error', message: ERROR_COPY.UPSTREAM_DOWN });
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller?.abort();
    };
  }, [query, attempt]);

  const candidates = state.kind === 'results' ? state.candidates : [];
  const listOpen = open && state.kind !== 'idle' && state.kind !== 'tooShort';

  /** Never navigate without an explicit choice, even when there is exactly one match. */
  function select(candidate: AddressCandidate) {
    setOpen(false);
    router.push(`/building/${encodeURIComponent(candidate.bbl)}`);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (candidates.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setHighlighted((index) => (index + 1) % candidates.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setHighlighted((index) => (index - 1 + candidates.length) % candidates.length);
    } else if (event.key === 'Enter') {
      const candidate = candidates[highlighted];
      if (candidate) {
        event.preventDefault();
        select(candidate);
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(event) => {
        if (!containerRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <label htmlFor="address-search" className="block text-sm font-medium text-slate-700">
        Enter the address you&rsquo;re about to sign for.
      </label>

      <input
        id="address-search"
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={listOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          state.kind === 'results' && listOpen ? `${listboxId}-option-${highlighted}` : undefined
        }
        placeholder="350 Grand Concourse, Bronx"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="mt-2 block w-full rounded-2xl border-0 bg-white px-4 py-4 text-base text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-700"
      />

      <p className="mt-2 min-h-[20px] text-xs text-slate-500">
        {state.kind === 'tooShort'
          ? `Keep typing — at least ${MIN_QUERY_LENGTH} characters.`
          : 'Any NYC address. Including the borough helps.'}
      </p>

      {/* Announce result changes without stealing focus from the input. */}
      <span aria-live="polite" className="sr-only">
        {state.kind === 'results' ? `${state.candidates.length} matching addresses` : ''}
        {state.kind === 'empty' ? 'No matching addresses' : ''}
      </span>

      {listOpen ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-200">
          {state.kind === 'loading' ? (
            <p className="px-4 py-4 text-sm text-slate-500">Searching&hellip;</p>
          ) : null}

          {state.kind === 'empty' ? (
            <p className="px-4 py-4 text-sm text-slate-600">
              We couldn&rsquo;t find that address. Try including the borough.
            </p>
          ) : null}

          {/*
            The city geocoder 503s under load, and it usually clears in seconds.
            Without this the dropdown is a dead end: the message sits there and the
            only way out is editing the query you already typed correctly.
          */}
          {state.kind === 'error' ? (
            <div className="px-4 py-4">
              <p className="text-sm text-slate-600">{state.message}</p>
              <button
                type="button"
                onClick={() => setAttempt((value) => value + 1)}
                className="mt-3 inline-flex min-h-[40px] items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
              >
                Try again
              </button>
            </div>
          ) : null}

          {state.kind === 'results' ? (
            <ul id={listboxId} role="listbox" aria-label="Matching addresses" className="max-h-80 overflow-y-auto">
              {state.candidates.map((candidate, index) => (
                <li
                  key={`${candidate.bbl}-${index}`}
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={index === highlighted}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseEnter={() => setHighlighted(index)}
                    onClick={() => select(candidate)}
                    className={cn(
                      'flex w-full min-h-[56px] items-center justify-between gap-3 px-4 py-3 text-left',
                      index === highlighted ? 'bg-blue-50' : 'bg-white',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {candidate.label}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {candidate.borough}
                        {' · BBL '}
                        {candidate.bbl}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-slate-400">
                      {Math.round(candidate.confidence * 100)}%
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
