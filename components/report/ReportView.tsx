'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BuildingReport, ErrorCode, Pattern } from '@/lib/types';
import { VerdictHeader } from '@/components/report/VerdictHeader';
import { StatTiles } from '@/components/report/StatTiles';
import { CategoryBreakdown } from '@/components/report/CategoryBreakdown';
import { PatternsSection } from '@/components/report/PatternsSection';
import { Timeline } from '@/components/report/Timeline';
import { RawRecords } from '@/components/report/RawRecords';
import { NarrativeSection } from '@/components/report/NarrativeSection';
import { Caveats } from '@/components/report/Caveats';
import { ReportSkeleton } from '@/components/report/ReportSkeleton';
import { NoRecordsState, RetryState } from '@/components/report/ReportStates';
import { MetricDrawer, type DrawerRequest } from '@/components/report/MetricDrawer';
import { Section } from '@/components/ui/Section';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; report: BuildingReport }
  | { kind: 'notFound' }
  | { kind: 'error'; code: ErrorCode };

const RETRYABLE_COPY: Record<ErrorCode, { title: string; message: string }> = {
  RATE_LIMITED: {
    title: 'Too many lookups right now',
    message:
      "NYC's data service is limiting how fast we can ask. Give it a few seconds and try again.",
  },
  UPSTREAM_DOWN: {
    title: "The city's data service isn't responding",
    message:
      "This is on NYC Open Data's end, not yours. It usually clears up quickly — try again in a moment.",
  },
  BAD_INPUT: {
    title: "We couldn't read that address",
    message: 'That building identifier looks malformed. Try searching for the address again.',
  },
  NOT_FOUND: {
    title: 'Building not found',
    message: 'We could not find a building with that identifier.',
  },
};

function isBuildingReport(value: unknown): value is BuildingReport {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as BuildingReport;
  return (
    typeof candidate.address === 'string' &&
    typeof candidate.bbl === 'string' &&
    typeof candidate.score === 'number' &&
    typeof candidate.grade === 'string' &&
    typeof candidate.stats === 'object' &&
    candidate.stats !== null &&
    Array.isArray(candidate.categories) &&
    Array.isArray(candidate.timeline) &&
    Array.isArray(candidate.sources)
  );
}

interface ReportViewProps {
  bbl: string;
}

export function ReportView({ bbl }: ReportViewProps) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [drawerRequest, setDrawerRequest] = useState<DrawerRequest | null>(null);
  const drawerToken = useRef(0);

  const retry = useCallback(() => {
    setState({ kind: 'loading' });
    setAttempt((value) => value + 1);
  }, []);

  const openDrawer = useCallback((request: Omit<DrawerRequest, 'token'>) => {
    drawerToken.current += 1;
    setDrawerRequest({ ...request, token: drawerToken.current });
  }, []);

  const openDrawerForPattern = useCallback(
    (pattern: Pattern) => {
      openDrawer({
        title: pattern.label,
        source: null,
        category: pattern.category,
        statusFilter: pattern.statusFilter,
        classFilter: pattern.classFilter,
        within24mo: false,
      });
    },
    [openDrawer],
  );

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(`/api/building?bbl=${encodeURIComponent(bbl)}`, {
          signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => null);

        if (payload && typeof payload === 'object' && 'error' in payload) {
          const err = (payload as { error: { code?: string } }).error;
          const code = typeof err?.code === 'string' ? err.code : 'UPSTREAM_DOWN';
          if (code === 'NOT_FOUND') {
            setState({ kind: 'notFound' });
            return;
          }
          setState({
            kind: 'error',
            code: code in RETRYABLE_COPY ? (code as ErrorCode) : 'UPSTREAM_DOWN',
          });
          return;
        }

        if (!response.ok || typeof payload !== 'object' || payload === null) {
          setState({ kind: 'error', code: 'UPSTREAM_DOWN' });
          return;
        }

        const report = (payload as { report?: unknown }).report;
        if (!isBuildingReport(report)) {
          setState({ kind: 'error', code: 'UPSTREAM_DOWN' });
          return;
        }

        setState({ kind: 'ready', report });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ kind: 'error', code: 'UPSTREAM_DOWN' });
      }
    })();

    return () => controller.abort();
  }, [bbl, attempt]);

  if (state.kind === 'loading') return <ReportSkeleton />;
  if (state.kind === 'notFound') return <NoRecordsState bbl={bbl} />;
  if (state.kind === 'error') {
    const copy = RETRYABLE_COPY[state.code];
    // BAD_INPUT is deterministic — the same malformed BBL fails identically forever.
    const canRetry = state.code !== 'BAD_INPUT';
    return (
      <RetryState
        title={copy.title}
        message={copy.message}
        onRetry={canRetry ? retry : undefined}
      />
    );
  }

  const { report } = state;

  return (
    <article className="pb-4">
      {/* Hard data first, interpretation last. That ordering is the product. */}
      <VerdictHeader report={report} />

      <Section
        title="The numbers"
        caption="Straight from the city's records for this address. Tap any figure to see the real records behind it."
      >
        <StatTiles report={report} onOpenDrawer={openDrawer} />
      </Section>

      <Section
        title="What the complaints are about"
        caption="Most serious first. The large number is the last 24 months. One complaint can raise several issues at once, so these add up to more than the building's complaint total."
      >
        <CategoryBreakdown categories={report.categories} onOpenDrawer={openDrawer} />
      </Section>

      <Section
        title="Patterns detected"
        caption="Deterministic, not AI-generated — computed from the same records below."
      >
        <PatternsSection patterns={report.patterns} onViewRecords={openDrawerForPattern} />
      </Section>

      <Section
        title="Building History"
        caption="Unresolved items first, then newest. Up to the 40 most recent records."
      >
        <Timeline timeline={report.timeline} categories={report.categories} />
      </Section>

      <Section title="Check our work" caption="Every row below links to the city dataset it came from.">
        <RawRecords report={report} />
      </Section>

      <NarrativeSection report={report} />

      <Caveats report={report} />

      <MetricDrawer
        request={drawerRequest}
        onClose={() => setDrawerRequest(null)}
        bbl={report.bbl}
        dataAsOf={report.dataAsOf}
        categories={report.categories}
      />
    </article>
  );
}
