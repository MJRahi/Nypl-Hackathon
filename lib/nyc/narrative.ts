import Anthropic from '@anthropic-ai/sdk';
import type { BuildingReport, Category, Severity } from '@/lib/types';

/**
 * Narrative generation. Aggregates in, prose out.
 *
 * Two rules are enforced in code rather than trusted to the prompt:
 *  1. Raw record arrays never reach the model — the request body is parsed
 *     against an explicit allowlist and anything else is rejected.
 *  2. The model never contributes a number — every figure in the generated
 *     text is checked against the figures we supplied, and a narrative that
 *     invents one is discarded.
 */

const MODEL = 'claude-opus-5';
const TIMEOUT_MS = 12_000;
const MAX_TOKENS = 4096;

/** Keys that mean somebody is about to send us raw city records. */
const FORBIDDEN_KEYS = new Set([
  'timeline',
  'records',
  'rows',
  'complaints',
  'violations',
  'events',
  'raw',
  'hpdComplaints',
  'hpdViolations',
  'dobComplaints',
  'dobViolations',
  'filings',
  'data',
]);

// ---------------------------------------------------------------------------
// Request shape
// ---------------------------------------------------------------------------

export interface NarrativeCategory {
  key: Category;
  label: string;
  count24mo: number;
  countAllTime: number;
  openCount: number;
  severity: Severity;
}

export interface NarrativeInput {
  address: string;
  borough: string;
  unitCount: number | null;
  yearBuilt: number | null;
  grade: BuildingReport['grade'];
  score: number;
  stats: BuildingReport['stats'];
  categories: NarrativeCategory[];
  bedbug: BuildingReport['bedbug'];
}

export type Narrative = NonNullable<BuildingReport['narrative']>;

/** Convenience for the client: reduce a full report to the aggregates only. */
export function toNarrativeInput(report: BuildingReport): NarrativeInput {
  return {
    address: report.address,
    borough: report.borough,
    unitCount: report.unitCount,
    yearBuilt: report.yearBuilt,
    grade: report.grade,
    score: report.score,
    stats: report.stats,
    categories: report.categories.map((c) => ({
      key: c.key,
      label: c.label,
      count24mo: c.count24mo,
      countAllTime: c.countAllTime,
      openCount: c.openCount,
      severity: c.severity,
    })),
    bedbug: report.bedbug,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ValidationResult =
  | { ok: true; value: NarrativeInput }
  | { ok: false; message: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Walks the body looking for arrays of objects, which is what a page of raw
 * HPD/DOB records looks like. The one legitimate array of objects is
 * `categories`, and it is validated field by field below.
 */
function findRawRecords(value: unknown, path: string): string | null {
  if (Array.isArray(value)) {
    if (value.some(isObject)) return path;
    if (value.length > 32) return path;
    return null;
  }
  if (!isObject(value)) return null;

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) return `${path}.${key}`;
    const found = findRawRecords(child, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

export function validateNarrativeInput(body: unknown): ValidationResult {
  if (!isObject(body)) return { ok: false, message: 'Body must be a JSON object.' };

  for (const key of Object.keys(body)) {
    if (FORBIDDEN_KEYS.has(key)) {
      return {
        ok: false,
        message: `Field "${key}" looks like raw records. This endpoint accepts aggregates only.`,
      };
    }
  }

  const { categories, stats, bedbug, ...scalars } = body;

  const rawPath = findRawRecords(scalars, 'body');
  if (rawPath) {
    return {
      ok: false,
      message: `Field "${rawPath}" contains record-shaped data. This endpoint accepts aggregates only.`,
    };
  }

  if (!isObject(stats)) return { ok: false, message: 'Field "stats" is required.' };
  if (!isObject(bedbug)) return { ok: false, message: 'Field "bedbug" is required.' };
  if (!Array.isArray(categories)) {
    return { ok: false, message: 'Field "categories" is required.' };
  }
  if (categories.length > 8) {
    return { ok: false, message: 'Field "categories" must hold at most 8 aggregate rows.' };
  }

  const requiredStats = [
    'hpdComplaintsAllTime',
    'hpdComplaints24mo',
    'openViolations',
    'closedViolations',
    'classCViolations',
    'dobComplaints24mo',
    'cityMedianPerUnitPerYear',
  ] as const;

  for (const key of requiredStats) {
    if (!num(stats[key])) {
      return { ok: false, message: `stats.${key} must be a number.` };
    }
  }

  const perUnit = stats['complaintsPerUnitPerYear'];
  if (perUnit !== null && !num(perUnit)) {
    return { ok: false, message: 'stats.complaintsPerUnitPerYear must be a number or null.' };
  }

  const cleanCategories: NarrativeCategory[] = [];
  for (const entry of categories) {
    if (!isObject(entry)) {
      return { ok: false, message: 'Each category must be an aggregate object.' };
    }
    const extra = Object.keys(entry).filter(
      (k) => !['key', 'label', 'count24mo', 'countAllTime', 'openCount', 'severity'].includes(k),
    );
    if (extra.length > 0) {
      return {
        ok: false,
        message: `Category contains unexpected field "${extra[0]}". Aggregates only.`,
      };
    }
    if (
      typeof entry.key !== 'string' ||
      typeof entry.label !== 'string' ||
      typeof entry.severity !== 'string' ||
      !num(entry.count24mo) ||
      !num(entry.countAllTime) ||
      !num(entry.openCount)
    ) {
      return { ok: false, message: 'Category aggregate has a missing or mistyped field.' };
    }
    cleanCategories.push({
      key: entry.key as Category,
      label: entry.label,
      count24mo: entry.count24mo,
      countAllTime: entry.countAllTime,
      openCount: entry.openCount,
      severity: entry.severity as Severity,
    });
  }

  if (typeof scalars.grade !== 'string' || !num(scalars.score)) {
    return { ok: false, message: 'Fields "grade" and "score" are required.' };
  }

  return {
    ok: true,
    value: {
      address: typeof scalars.address === 'string' ? scalars.address : '',
      borough: typeof scalars.borough === 'string' ? scalars.borough : '',
      unitCount: num(scalars.unitCount) ? scalars.unitCount : null,
      yearBuilt: num(scalars.yearBuilt) ? scalars.yearBuilt : null,
      grade: scalars.grade as BuildingReport['grade'],
      score: scalars.score,
      stats: stats as unknown as BuildingReport['stats'],
      categories: cleanCategories,
      bedbug: bedbug as unknown as BuildingReport['bedbug'],
    },
  };
}

// ---------------------------------------------------------------------------
// Numeric fidelity
// ---------------------------------------------------------------------------

/** Every number we handed the model, in the forms it might echo them back. */
function allowedNumbers(input: NarrativeInput): Set<string> {
  const allowed = new Set<string>();

  const add = (value: unknown): void => {
    if (!num(value)) return;
    allowed.add(String(value));
    allowed.add(String(Math.round(value)));
    allowed.add(value.toFixed(1));
    allowed.add(value.toFixed(2));
  };

  add(input.unitCount);
  add(input.yearBuilt);
  add(input.score);
  for (const value of Object.values(input.stats)) add(value);
  for (const c of input.categories) {
    add(c.count24mo);
    add(c.countAllTime);
    add(c.openCount);
  }
  add(input.bedbug.infestedUnits);
  add(input.bedbug.year);

  // Ordinals and small counts the model uses to structure prose ("two of them",
  // "the last 24 months") rather than to assert a figure about the building.
  for (let i = 0; i <= 24; i += 1) allowed.add(String(i));

  return allowed;
}

/**
 * Returns any number in the generated text that we did not supply. A non-empty
 * result means the model did arithmetic, and the narrative is thrown away.
 */
export function unsupportedNumbers(narrative: Narrative, input: NarrativeInput): string[] {
  const allowed = allowedNumbers(input);
  const text = [narrative.summary, ...narrative.redFlags, ...narrative.questionsToAsk].join(' ');

  const found = text.match(/\d+(?:\.\d+)?/g) ?? [];
  return Array.from(new Set(found.filter((n) => !allowed.has(n) && !allowed.has(String(Number(n))))));
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You write plain-language summaries of a NYC building's public housing record for a renter deciding whether to sign a lease.

Interpret only the figures given to you in the user message. Never introduce a number that is not in that data, and never compute a new one — no totals, averages, percentages, ratios, rates of change, or comparisons you would have to calculate. When you refer to a figure, use it exactly as given. If you want to characterize magnitude, use words ("well above", "a handful", "roughly half the categories") rather than arithmetic.

Describe the public record, not the landlord. Say what was filed, how many are open, and what a renter would want to understand. Do not assert intent, negligence, or wrongdoing, and do not predict what will happen. Complaints and violations are records of what was reported and inspected; write them that way.

Write for someone with no housing-code knowledge. Expand jargon the first time it appears — class C violations are the city's "immediately hazardous" tier. Keep the summary to 3-5 sentences. Give 2-5 red flags and 3-5 questions; each should be one sentence and specific to this building's record. If the record is clean, say so plainly rather than manufacturing concerns.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    redFlags: { type: 'array', items: { type: 'string' } },
    questionsToAsk: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'redFlags', 'questionsToAsk'],
  additionalProperties: false,
} as const;

function buildUserMessage(input: NarrativeInput): string {
  const lines = [
    `Address: ${input.address || 'unknown'} (${input.borough || 'NYC'})`,
    `Year built: ${input.yearBuilt ?? 'unknown'}`,
    `Residential units: ${input.unitCount ?? 'unknown'}`,
    `Overall grade: ${input.grade} (score ${input.score} out of 100)`,
    '',
    'Aggregate counts:',
    `- HPD complaints, all time: ${input.stats.hpdComplaintsAllTime}`,
    `- HPD complaints, last 24 months: ${input.stats.hpdComplaints24mo}`,
    `- Open HPD violations: ${input.stats.openViolations}`,
    `- Closed HPD violations: ${input.stats.closedViolations}`,
    `- Open class C violations (immediately hazardous): ${input.stats.classCViolations}`,
    `- DOB complaints, last 24 months: ${input.stats.dobComplaints24mo}`,
    `- Complaints per unit per year: ${
      input.stats.complaintsPerUnitPerYear ?? 'not available (unit count unknown)'
    }`,
    `- Citywide median complaints per unit per year: ${input.stats.cityMedianPerUnitPerYear}`,
    '',
    'By category (24 months / all time / currently open):',
    ...input.categories.map(
      (c) =>
        `- ${c.label}: ${c.count24mo} / ${c.countAllTime} / ${c.openCount} open (severity: ${c.severity})`,
    ),
    '',
    input.bedbug.reported
      ? `Bedbugs: an infestation affecting ${
          input.bedbug.infestedUnits ?? 'an unstated number of'
        } units was filed in ${input.bedbug.year ?? 'an unstated year'}.`
      : 'Bedbugs: no infestation reported in the annual filings.',
  ];

  return lines.join('\n');
}

function parseNarrative(raw: string): Narrative | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(parsed)) return null;

  const { summary, redFlags, questionsToAsk } = parsed;
  if (typeof summary !== 'string' || summary.trim() === '') return null;
  if (!Array.isArray(redFlags) || !Array.isArray(questionsToAsk)) return null;

  const strings = (arr: unknown[]): string[] =>
    arr.filter((v): v is string => typeof v === 'string' && v.trim() !== '');

  return {
    summary: summary.trim(),
    redFlags: strings(redFlags),
    questionsToAsk: strings(questionsToAsk),
  };
}

/**
 * Returns null on every failure path — missing key, timeout, upstream error,
 * malformed output, or a narrative that invented a number. The report renders
 * without it.
 */
export async function generateNarrative(input: NarrativeInput): Promise<Narrative | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    console.warn('[narrative] ANTHROPIC_API_KEY is not set; skipping narrative.');
    return null;
  }

  // Retries would blow the 12s budget: the SDK multiplies timeout by attempts.
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

    if (response.stop_reason === 'refusal') {
      console.warn('[narrative] model declined the request.');
      return null;
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const narrative = parseNarrative(text);
    if (!narrative) {
      console.warn('[narrative] response was not usable JSON.');
      return null;
    }

    if (process.env.NARRATIVE_STRICT_NUMBERS !== '0') {
      const invented = unsupportedNumbers(narrative, input);
      if (invented.length > 0) {
        console.warn(
          `[narrative] discarded: text contains figures we did not supply (${invented.join(', ')}).`,
        );
        return null;
      }
    }

    return narrative;
  } catch (cause) {
    console.warn(
      '[narrative] generation failed:',
      cause instanceof Error ? cause.message : cause,
    );
    return null;
  }
}
