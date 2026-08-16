import { NextResponse } from 'next/server';
import type { ApiError } from '@/lib/types';
import { explainRecord, validateRecordExplainInput } from '@/lib/nyc/record-explain';

export const dynamic = 'force-dynamic';

type RecordExplainResponse = { explanation: string | null };

/**
 * POST /api/record-explain -> { explanation: string | null }
 *
 * Body: { record: { source, category, status, className, date, description } }
 * — the record's own already-real fields, nothing else. A malformed body is
 * BAD_INPUT; every other failure (missing key, timeout, a hazard word the
 * record didn't license) resolves to explanation: null with a 200, since the
 * drawer renders fine without one — this is a nice-to-have, not load-bearing.
 */
export async function POST(
  request: Request,
): Promise<NextResponse<RecordExplainResponse | ApiError>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiError>(
      { error: { code: 'BAD_INPUT', message: 'Body must be valid JSON.' } },
      { status: 400 },
    );
  }

  const parsed = validateRecordExplainInput(body);
  if (!parsed.ok) {
    return NextResponse.json<ApiError>(
      { error: { code: 'BAD_INPUT', message: parsed.message } },
      { status: 400 },
    );
  }

  const explanation = await explainRecord(parsed.value);
  return NextResponse.json<RecordExplainResponse>({ explanation });
}
