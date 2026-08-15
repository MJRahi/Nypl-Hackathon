import { NextResponse } from 'next/server';
import type { ApiError, BuildingReport } from '@/lib/types';
import { BuildingNotFoundError, getBuildingReport } from '@/lib/nyc/report';
import { CircuitOpenError } from '@/lib/nyc/cache';

export const dynamic = 'force-dynamic';

type BuildingResponse = { report: BuildingReport };

/**
 * GET /api/building?bbl= -> { report: BuildingReport }
 *
 * narrative is always null here; the client fills it via POST /api/narrative.
 * Resolution order (demo file, cache, in-flight dedupe, live, stale) lives in
 * lib/nyc/cache.ts.
 */
export async function GET(
  request: Request,
): Promise<NextResponse<BuildingResponse | ApiError>> {
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
    const { report, source } = await getBuildingReport(bbl);
    return NextResponse.json<BuildingResponse>({ report }, { headers: { 'X-Report-Source': source } });
  } catch (cause) {
    if (cause instanceof BuildingNotFoundError) {
      return NextResponse.json<ApiError>(
        { error: { code: 'NOT_FOUND', message: 'No NYC records found for that building.' } },
        { status: 404 },
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

    console.error('[building] report failed:', cause);
    return NextResponse.json<ApiError>(
      {
        error: {
          code: 'UPSTREAM_DOWN',
          message: 'Could not build the report for that building right now.',
        },
      },
      { status: 502 },
    );
  }
}
