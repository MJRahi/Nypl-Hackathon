import { NextResponse } from 'next/server';
import type { ApiError } from '@/lib/types';
import { getRentRegulationSignal, type RentRegulationSignal } from '@/lib/nyc/rentStabilization';

export const dynamic = 'force-dynamic';

type RentRegulationResponse = { signal: RentRegulationSignal };

/**
 * GET /api/rent-regulation?bbl= -> { signal: RentRegulationSignal }
 *
 * Separate from /api/building on purpose: rent stabilization is not part of the
 * frozen BuildingReport and is not an input to the Walkthrough score. A renter
 * who loads a report should get one whether or not this route answers.
 *
 * Only malformed input is an error. An upstream failure comes back as a 200
 * carrying the 'unconfirmed' verdict, because "we couldn't confirm this" is the
 * true answer in that case and it is already one of the two states the card
 * knows how to render.
 */
export async function GET(
  request: Request,
): Promise<NextResponse<RentRegulationResponse | ApiError>> {
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

  const signal = await getRentRegulationSignal(bbl);
  return NextResponse.json<RentRegulationResponse>({ signal });
}
