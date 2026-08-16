import Anthropic from '@anthropic-ai/sdk';
import type { Category } from '@/lib/types';

/**
 * "What does this mean?" — one record in, one or two plain-English sentences
 * out. Mirrors lib/nyc/narrative.ts's discipline: the model explains facts
 * that were already computed/fetched in TypeScript, it never adds one. Since
 * the input here carries no numbers to echo, there's nothing to invent a
 * figure with — the risk is inventing a CAUSE, a PARTY, or a DIAGNOSIS
 * instead, which the prompt and a lightweight word-leakage check both guard
 * against.
 */

const MODEL = 'claude-sonnet-5';
const TIMEOUT_MS = 10_000;
const MAX_TOKENS = 300;

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

const SOURCES = ['HPD_COMPLAINT', 'HPD_VIOLATION', 'DOB_COMPLAINT', 'DOB_VIOLATION'] as const;
type RecordSource = (typeof SOURCES)[number];

export interface RecordExplainInput {
  source: RecordSource;
  category: Category;
  status: 'open' | 'closed';
  className: 'A' | 'B' | 'C' | null;
  date: string;
  description: string;
}

/** Words the model must never introduce unless they were already in the record's own description. */
const DIAGNOSIS_WORDS = ['mold', 'asbestos', 'lead paint', 'lead-based', 'toxic', 'carcinogen'];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type ValidationResult =
  | { ok: true; value: RecordExplainInput }
  | { ok: false; message: string };

export function validateRecordExplainInput(body: unknown): ValidationResult {
  if (!isObject(body)) return { ok: false, message: 'Body must be a JSON object.' };
  const { record } = body;
  if (!isObject(record)) return { ok: false, message: 'Field "record" is required.' };

  const allowedKeys = ['source', 'category', 'status', 'className', 'date', 'description'];
  const extra = Object.keys(record).filter((k) => !allowedKeys.includes(k));
  if (extra.length > 0) {
    return { ok: false, message: `Field "record.${extra[0]}" is not part of this endpoint's contract.` };
  }

  const { source, category, status, className, date, description } = record;

  if (typeof source !== 'string' || !(SOURCES as readonly string[]).includes(source)) {
    return { ok: false, message: 'record.source must be a valid record source.' };
  }
  if (typeof category !== 'string' || !(CATEGORIES as readonly string[]).includes(category)) {
    return { ok: false, message: 'record.category must be a valid category.' };
  }
  if (status !== 'open' && status !== 'closed') {
    return { ok: false, message: 'record.status must be "open" or "closed".' };
  }
  if (className !== null && className !== 'A' && className !== 'B' && className !== 'C') {
    return { ok: false, message: 'record.className must be "A", "B", "C", or null.' };
  }
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, message: 'record.date must be an ISO date string.' };
  }
  if (typeof description !== 'string' || description.trim() === '') {
    return { ok: false, message: 'record.description is required.' };
  }
  if (description.length > 2000) {
    return { ok: false, message: 'record.description is too long.' };
  }

  return {
    ok: true,
    value: {
      source: source as RecordSource,
      category: category as Category,
      status,
      className,
      date,
      description: description.trim(),
    },
  };
}

const SOURCE_LABEL: Record<RecordSource, string> = {
  HPD_COMPLAINT: 'an HPD (Housing Preservation & Development) complaint',
  HPD_VIOLATION: 'an HPD housing-code violation',
  DOB_COMPLAINT: 'a DOB (Department of Buildings) complaint',
  DOB_VIOLATION: 'a DOB violation',
};

const SYSTEM_PROMPT = `You explain a single NYC housing record to a renter, in plain English. You are not a lawyer or inspector, and you must never add a fact that was not given to you.

Rules, no exceptions:
- Use only the record's own fields: source, category, status, class (if any), date, and description. Never invent a cause, a responsible party, a repair, an outcome, or a timeline beyond what's stated.
- Never diagnose a hazard (mold, lead, asbestos, gas, etc.) unless that exact word already appears in the description you were given. If it does not appear, do not use it.
- 1-2 short sentences, plain language. Expand jargon once (e.g. "class C, the city's immediately-hazardous tier").
- If the description is too terse or garbled to say anything useful, say plainly that little more can be determined from the record as filed — do not pad with a guess.
- Never give legal advice or predict what will happen next.

Respond with strict JSON matching the schema you were given.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: { explanation: { type: 'string' } },
  required: ['explanation'],
  additionalProperties: false,
} as const;

function buildUserMessage(input: RecordExplainInput): string {
  return [
    `Record type: ${SOURCE_LABEL[input.source]}`,
    `Category: ${input.category}`,
    `Status: ${input.status}`,
    `Class: ${input.className ?? 'not applicable'}`,
    `Date: ${input.date}`,
    `Description as filed: ${input.description}`,
  ].join('\n');
}

/** Refuses to hand back a diagnosis word the input never mentioned. */
function leaksDiagnosis(explanation: string, input: RecordExplainInput): boolean {
  const lowerExplanation = explanation.toLowerCase();
  const lowerDescription = input.description.toLowerCase();
  return DIAGNOSIS_WORDS.some(
    (word) => lowerExplanation.includes(word) && !lowerDescription.includes(word),
  );
}

/**
 * Returns null on every failure path (missing key, timeout, refusal,
 * malformed output, a word the input didn't license) — the UI shows "not
 * available" rather than treating this as a hard error, same as narrative.
 */
export async function explainRecord(input: RecordExplainInput): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    console.warn('[record-explain] ANTHROPIC_API_KEY is not set; skipping.');
    return null;
  }

  const client = new Anthropic({ apiKey, maxRetries: 0 });

  try {
    const response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        output_config: {
          effort: 'low',
          format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
        },
        messages: [{ role: 'user', content: buildUserMessage(input) }],
      },
      { timeout: TIMEOUT_MS },
    );

    if (response.stop_reason === 'refusal') return null;

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
    if (!isObject(parsed) || typeof parsed.explanation !== 'string') return null;

    const explanation = parsed.explanation.trim();
    if (!explanation) return null;
    if (leaksDiagnosis(explanation, input)) {
      console.warn('[record-explain] discarded: explanation named a hazard the record did not.');
      return null;
    }

    return explanation;
  } catch (cause) {
    console.warn(
      '[record-explain] generation failed:',
      cause instanceof Error ? cause.message : cause,
    );
    return null;
  }
}
