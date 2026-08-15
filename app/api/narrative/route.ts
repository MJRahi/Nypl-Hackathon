import { NextResponse } from 'next/server';
import type { ApiError, BuildingReport } from '@/lib/types';
import { generateNarrative, validateNarrativeInput } from '@/lib/nyc/narrative';

export const dynamic = 'force-dynamic';

type NarrativeResponse = { narrative: BuildingReport['narrative'] };

/**
 * POST /api/narrative -> { narrative: {...} | null }
 *
 * Body is AGGREGATES ONLY — see toNarrativeInput() in lib/nyc/narrative.ts for
 * the exact shape. A body carrying raw record arrays is rejected with
 * BAD_INPUT; every other failure resolves to narrative: null with a 200, since
 * the report renders fine without one.
 */
export async function POST(
  request: Request,
): Promise<NextResponse<NarrativeResponse | ApiError>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiError>(
      { error: { code: 'BAD_INPUT', message: 'Body must be valid JSON.' } },
      { status: 400 },
    );
  }

  const parsed = validateNarrativeInput(body);
  if (!parsed.ok) {
    return NextResponse.json<ApiError>(
      { error: { code: 'BAD_INPUT', message: parsed.message } },
      { status: 400 },
    );
  }

  const narrative = await generateNarrative(parsed.value);
  return NextResponse.json<NarrativeResponse>({ narrative });
}
