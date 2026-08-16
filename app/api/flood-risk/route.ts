import { NextResponse } from 'next/server';
import type { ApiError } from '@/lib/types';
import { FloodInputError, getFloodRisk, parseCoordinates, type FloodRisk } from '@/lib/nyc/flood';

export const dynamic = 'force-dynamic';

type FloodRiskResponse = { flood: FloodRisk };

/**
 * GET /api/flood-risk?lat=&lng= -> { flood: FloodRisk }
 *
 * Separate from /api/building on purpose: the frozen BuildingReport has no
 * flood field, and a flood lookup failing must not touch the report, the grade,
 * or the score. Keeping city calls here also keeps them off the browser.
 *
 * An unreachable flood layer is NOT an error — it comes back 200 with
 * level:'unavailable' so the page renders a quiet unavailable state instead of
 * an error banner.
 */
export async function GET(
  request: Request,
): Promise<NextResponse<FloodRiskResponse | ApiError>> {
  const { searchParams } = new URL(request.url);

  let lat: number;
  let lng: number;
  try {
    ({ lat, lng } = parseCoordinates(searchParams.get('lat'), searchParams.get('lng')));
  } catch (cause) {
    const message =
      cause instanceof FloodInputError ? cause.message : 'lat and lng are required.';
    return NextResponse.json<ApiError>(
      { error: { code: 'BAD_INPUT', message } },
      { status: 400 },
    );
  }

  try {
    const flood = await getFloodRisk(lat, lng);
    return NextResponse.json<FloodRiskResponse>({ flood });
  } catch (cause) {
    console.error('[flood-risk] lookup failed:', cause);
    // Still a 200: the section degrades to "unavailable" rather than breaking
    // the rest of the report.
    return NextResponse.json<FloodRiskResponse>({
      flood: {
        level: 'unavailable',
        headline: 'Flood mapping could not be reached right now.',
        findings: [],
        questions: [],
        sources: [],
        checkedAt: new Date().toISOString(),
      },
    });
  }
}
