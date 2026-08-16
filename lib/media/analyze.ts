import Anthropic from '@anthropic-ai/sdk';
import type { Category, MediaAnalysis, MediaFinding, Severity } from '@/lib/types';
import { RateLimitedError } from '@/lib/nyc/cache';

/**
 * Vision analysis. Photos in, cautious observations out.
 *
 * The route (app/api/analyze-media/route.ts) owns validation, the error
 * contract, and the response envelope — nothing outside this file needs to
 * change. Contract to keep:
 *  - frameCount must equal frames.length
 *  - every finding's frameIndex must be a valid index into frames
 *  - disclaimer must be non-empty; it is rendered next to every finding
 *  - throw on failure; the route maps that to UPSTREAM_DOWN
 */

export const MEDIA_DISCLAIMER =
  'Automated review of renter-submitted photos. This is not a professional inspection, it cannot confirm or rule out any condition, and it carries no legal weight. Findings point to things worth asking about in person.';

const MODEL = 'claude-sonnet-5';
const TIMEOUT_MS = 25_000;
// Generous relative to MAX_FINDINGS: a full 20-finding response (label +
// 1-2 sentence note each) must not get truncated mid-JSON.
const MAX_TOKENS = 4096;

/** Cap on findings we'll accept back, independent of frame count. */
const MAX_FINDINGS = 20;

const CATEGORIES: readonly Category[] = [
  'heat_hot_water',
  'plumbing',
  'pests',
  'electrical',
  'structural',
  'elevator',
  'safety',
  'other',
];

const CONFIDENCE_LEVELS: readonly Severity[] = ['low', 'medium', 'high'];

/**
 * Constrained hard on purpose: a confident wrong answer about mold is worse
 * than none. The model reports observations and questions, never diagnoses,
 * and an empty findings array is treated as a correct result, not a failure.
 */
const SYSTEM_PROMPT = `You are reviewing photos a prospective renter took while touring a NYC apartment, looking for physical conditions worth asking the landlord or super about before signing a lease.

You are not an inspector and must never diagnose a condition. Describe only what is visibly observable in the photo, and turn every observation into something to ask about in person. Write "Possible water staining near the ceiling — ask when this was last repaired," never "this apartment has mold" or "there is a leak." Never name a specific hazard (mold, lead, asbestos, bedbugs, gas leak) as a conclusion — you may raise it only as a question to ask if the visual evidence is suggestive, and only using hedged language ("possible", "worth asking about").

Look specifically for: water staining or discoloration, peeling or bubbling paint, cracks in walls or ceilings, window condition and seals, missing or painted-over smoke/CO detectors, exposed or damaged wiring, radiator condition, signs of pest activity (droppings, holes, dead insects, chew marks), under-sink plumbing and cabinet condition, and door and lock condition.

If a photo shows nothing notable, or you genuinely cannot tell, do not invent a finding for it. An empty findings array is a correct and honest result — never pad the list to seem thorough, and never report the same issue twice for one frame.

confidence reflects how visually clear the observation itself is (not how serious it is), and must be exactly "low", "medium", or "high" — never a percentage or any other value or word. category must be exactly one of: heat_hot_water, plumbing, pests, electrical, structural, elevator, safety, other — pick the closest fit; use "other" only when nothing else is close.

Each finding's frameIndex must be the frame number given in the message (starting at 0) where you saw it. label is a short, plain, under-8-word description of what's visible. note is one or two sentences telling the renter what to ask or check in person — a question or action, never a diagnosis or a claim about cause.

Respond with strict JSON matching the schema you were given. Do not include any commentary outside the JSON.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      maxItems: MAX_FINDINGS,
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          category: { type: 'string', enum: CATEGORIES as unknown as string[] },
          confidence: { type: 'string', enum: CONFIDENCE_LEVELS as unknown as string[] },
          frameIndex: { type: 'integer' },
          note: { type: 'string' },
        },
        required: ['label', 'category', 'confidence', 'frameIndex', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['findings'],
  additionalProperties: false,
} as const;

/** Mirrors the parsing lib/nyc/cache.ts applies to Socrata's Retry-After. */
function parseRetryAfterHeader(headers: Headers | null | undefined): number | null {
  const header = headers?.get('retry-after');
  if (!header) return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());

  return null;
}

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

const DATA_URL_PATTERN = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/;

/** Frames arrive as data URLs from client-side canvas export; tolerate bare base64 too. */
function parseFrame(frame: string): { mediaType: ImageMediaType; data: string } {
  const match = DATA_URL_PATTERN.exec(frame);
  if (match) {
    return { mediaType: match[1] as ImageMediaType, data: match[2] };
  }
  return { mediaType: 'image/jpeg', data: frame };
}

function buildContent(frames: string[]): Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> {
  const blocks: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [
    {
      type: 'text',
      text: `Here ${frames.length === 1 ? 'is' : 'are'} ${frames.length} photo${
        frames.length === 1 ? '' : 's'
      } from a prospective rental apartment, labeled Frame 0 through Frame ${frames.length - 1} in order.`,
    },
  ];

  frames.forEach((frame, index) => {
    const { mediaType, data } = parseFrame(frame);
    blocks.push({ type: 'text', text: `Frame ${index}:` });
    blocks.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data } });
  });

  return blocks;
}

function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

function isConfidence(value: unknown): value is Severity {
  return typeof value === 'string' && (CONFIDENCE_LEVELS as readonly string[]).includes(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Drops anything malformed rather than trusting the model's JSON blindly. */
function toFindings(raw: unknown[], frameCount: number): MediaFinding[] {
  const findings: MediaFinding[] = [];

  for (const item of raw) {
    if (!isObject(item)) continue;
    const { label, category, confidence, frameIndex, note } = item;

    if (typeof label !== 'string' || label.trim() === '') continue;
    if (typeof note !== 'string' || note.trim() === '') continue;
    if (!isCategory(category) || !isConfidence(confidence)) continue;
    if (typeof frameIndex !== 'number' || !Number.isInteger(frameIndex)) continue;
    if (frameIndex < 0 || frameIndex >= frameCount) continue;

    findings.push({
      id: `finding-${findings.length + 1}`,
      label: label.trim(),
      category,
      confidence,
      frameIndex,
      note: note.trim(),
    });

    if (findings.length >= MAX_FINDINGS) break;
  }

  return findings;
}

/**
 * STUB REPLACED — real vision call. Throws on any failure (missing key,
 * timeout, refusal, malformed response); the route maps that to
 * UPSTREAM_DOWN. Never returns a fabricated diagnosis: findings are dropped
 * rather than guessed at if they don't cleanly fit the schema.
 */
export async function analyzeFrames(frames: string[]): Promise<MediaAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set.');
  }

  // Retries would blow the request timeout budget: the SDK multiplies timeout by attempts.
  const client = new Anthropic({ apiKey, maxRetries: 0 });

  let response: Anthropic.Message;
  try {
    response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        output_config: {
          effort: 'low',
          format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
        },
        messages: [{ role: 'user', content: buildContent(frames) }],
      },
      { timeout: TIMEOUT_MS },
    );
  } catch (cause) {
    // Distinct from a broken provider: the UI tells the renter "try again in
    // a moment" rather than "something's down," same as the NYC data routes.
    if (cause instanceof Anthropic.RateLimitError) {
      throw new RateLimitedError(
        'vision provider rate limited the request',
        parseRetryAfterHeader(cause.headers),
      );
    }
    throw cause;
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('Vision model declined the request.');
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Vision model returned malformed JSON.');
  }

  const rawFindings = isObject(parsed) ? parsed.findings : undefined;
  if (!Array.isArray(rawFindings)) {
    throw new Error('Vision model response was missing a findings array.');
  }

  return {
    frameCount: frames.length,
    findings: toFindings(rawFindings, frames.length),
    disclaimer: MEDIA_DISCLAIMER,
  };
}
