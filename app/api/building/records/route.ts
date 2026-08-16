import { NextResponse } from 'next/server';
import type { ApiError, RecordDetail } from '@/lib/types';
import { BuildingNotFoundError } from '@/lib/nyc/report';
import { getBuildingRecords } from '@/lib/nyc/records';
import { CircuitOpenError, RateLimitedError } from '@/lib/nyc/cache';

export const dynamic = 'force-dynamic';

type RecordsResponse = { records: RecordDetail[] };

/**
 * GET /api/building/records?bbl= -> { records: RecordDetail[] }
 *
 * Deliberately separate from GET /api/building: some buildings have far more
 * records than anyone will ever click through, so this is fetched only when
 * a drill-down drawer actually opens. Same error contract and resolution
 * order (demo fixture, then live) as the main report route.
 */
export async function GET(
  request: Request,
): Promise<NextResponse<RecordsResponse | ApiError>> {
  const { searchParams } = new URL(request.url);
  const bbl = searchParams.get('bbl')?.trim() ?? '';

  if (!/^[1-5]\d{9}$/.test(bbl)) {
    return NextResponse.json<ApiError>(
      {
        error: {
          code: 'BAD_INPUT',
          message: 'Query parameter "bbl" must be a 10-digit NYC BBL.',
        },
      },
      { status: 400 },
    );
  }

  try {
    const records = await getBuildingRecords(bbl);
    return NextResponse.json<RecordsResponse>({ records });
  } catch (cause) {
    if (cause instanceof BuildingNotFoundError) {
      return NextResponse.json<ApiError>(
        { error: { code: 'NOT_FOUND', message: 'No NYC records found for that building.' } },
        { status: 404 },
      );
    }

    if (cause instanceof RateLimitedError || (cause instanceof CircuitOpenError && cause.rateLimited)) {
      const retryAfterMs = cause instanceof RateLimitedError ? cause.retryAfterMs : null;
      const retryAfterSec = Math.max(1, Math.ceil((retryAfterMs ?? 30_000) / 1000));
      return NextResponse.json<ApiError>(
        {
          error: {
            code: 'RATE_LIMITED',
            message: 'NYC Open Data is rate limiting us. Try again in a moment.',
          },
        },
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
      );
    }

    if (cause instanceof CircuitOpenError) {
      return NextResponse.json<ApiError>(
        {
          error: {
            code: 'UPSTREAM_DOWN',
            message: 'NYC Open Data is not responding. Try again shortly.',
          },
        },
        { status: 503 },
      );
    }

    console.error('[building/records] failed:', cause);
    return NextResponse.json<ApiError>(
      {
        error: {
          code: 'UPSTREAM_DOWN',
          message: 'Could not load records for that building right now.',
        },
      },
      { status: 502 },
    );
  }
}
