import { NextResponse } from 'next/server';
import type { ApiError, MediaAnalysis } from '@/lib/types';
import { analyzeFrames } from '@/lib/media/analyze';
import { RateLimitedError } from '@/lib/nyc/cache';

export const dynamic = 'force-dynamic';

type AnalyzeMediaResponse = { analysis: MediaAnalysis };

/** Frames arrive as base64 data URLs, which are large. Bound both dimensions. */
const MAX_FRAMES = 12;
const MAX_FRAME_CHARS = 3_000_000; // ~2.2MB of decoded image per frame

/**
 * POST /api/analyze-media -> { analysis: MediaAnalysis }
 * Body: { frames: string[] }
 *
 * The analysis itself is a stub; see lib/media/analyze.ts, which Person C
 * replaces. This route owns validation and the error contract, so swapping the
 * internals does not change the API surface.
 */
export async function POST(
  request: Request,
): Promise<NextResponse<AnalyzeMediaResponse | ApiError>> {
  const badInput = (message: string): NextResponse<ApiError> =>
    NextResponse.json<ApiError>({ error: { code: 'BAD_INPUT', message } }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badInput('Body must be valid JSON.');
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return badInput('Body must be a JSON object of the form { frames: string[] }.');
  }

  const { frames } = body as { frames?: unknown };

  if (!Array.isArray(frames)) {
    return badInput('Field "frames" must be an array of strings.');
  }
  if (frames.length === 0) {
    return badInput('Field "frames" must contain at least one frame.');
  }
  if (frames.length > MAX_FRAMES) {
    return badInput(`Field "frames" must contain at most ${MAX_FRAMES} frames.`);
  }
  if (!frames.every((f): f is string => typeof f === 'string' && f.length > 0)) {
    return badInput('Every frame must be a non-empty string.');
  }
  if (frames.some((f) => f.length > MAX_FRAME_CHARS)) {
    return badInput('One or more frames exceed the maximum size. Downscale before uploading.');
  }

  try {
    const analysis = await analyzeFrames(frames);
    return NextResponse.json<AnalyzeMediaResponse>({ analysis });
  } catch (cause) {
    // The stub cannot rate limit, but Person C's vision provider can.
    if (cause instanceof RateLimitedError) {
      const retryAfterSec = Math.max(1, Math.ceil((cause.retryAfterMs ?? 30_000) / 1000));
      return NextResponse.json<ApiError>(
        {
          error: {
            code: 'RATE_LIMITED',
            message: 'Image analysis is rate limited. Try again in a moment.',
          },
        },
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
      );
    }

    console.error('[analyze-media] analysis failed:', cause);
    return NextResponse.json<ApiError>(
      {
        error: {
          code: 'UPSTREAM_DOWN',
          message: 'Could not analyze those images right now.',
        },
      },
      { status: 502 },
    );
  }
}
