import { NextResponse } from 'next/server';
import type { AddressCandidate, ApiError } from '@/lib/types';
import { geocodeAddress, GeocodeUpstreamError } from '@/lib/nyc/geocode';
import { RateLimitedError } from '@/lib/nyc/cache';

export const dynamic = 'force-dynamic';

type GeocodeResponse = { candidates: AddressCandidate[] };

/**
 * GET /api/geocode?q= -> { candidates: AddressCandidate[] }
 *
 * A search that matches nothing is a 200 with an empty array, not an error.
 * Only a missing/blank q is BAD_INPUT; only a broken upstream is UPSTREAM_DOWN.
 */
export async function GET(
  request: Request,
): Promise<NextResponse<GeocodeResponse | ApiError>> {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  if (q === null || q.trim() === '') {
    return NextResponse.json<ApiError>(
      { error: { code: 'BAD_INPUT', message: 'Query parameter "q" is required.' } },
      { status: 400 },
    );
  }

  try {
    const candidates = await geocodeAddress(q);
    return NextResponse.json<GeocodeResponse>({ candidates });
  } catch (cause) {
    if (cause instanceof RateLimitedError) {
      const retryAfterSec = Math.max(1, Math.ceil((cause.retryAfterMs ?? 15_000) / 1000));
      return NextResponse.json<ApiError>(
        {
          error: {
            code: 'RATE_LIMITED',
            message: 'Address lookup is rate limited. Try again in a moment.',
          },
        },
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
      );
    }

    if (cause instanceof GeocodeUpstreamError) {
      console.error('[geocode] upstream failure:', cause.message);
      return NextResponse.json<ApiError>(
        {
          error: {
            code: 'UPSTREAM_DOWN',
            message: 'The NYC geocoding service is unavailable. Try again in a moment.',
          },
        },
        { status: 502 },
      );
    }
    throw cause;
  }
}
