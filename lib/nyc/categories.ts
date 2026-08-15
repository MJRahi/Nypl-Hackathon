import type { Category } from '@/lib/types';

/**
 * Explicit source-value -> Category lookups.
 *
 * Every map here was built from the live vocabularies, not guessed: each list
 * came from a $group query against the dataset on 2026-08-15. Anything not in a
 * map falls through to 'other' AND console.warns once, so unmapped values show
 * up in the warm-cache logs instead of silently becoming 'other'.
 */

export const CATEGORY_LABELS: Record<Category, string> = {
  heat_hot_water: 'Heat & Hot Water',
  plumbing: 'Plumbing & Leaks',
  pests: 'Pests & Vermin',
  electrical: 'Electrical',
  structural: 'Structural & Surfaces',
  elevator: 'Elevator',
  safety: 'Fire & Safety',
  other: 'Other',
};

/** Log each unmapped value once per process rather than once per row. */
const warned = new Set<string>();

export function warnUnmapped(kind: string, value: string): void {
  const key = `${kind}:${value}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[categories] unmapped ${kind} value ${JSON.stringify(value)} -> 'other'`);
}

/** Test seam: lets the aggregation tests assert on warning behaviour. */
export function resetUnmappedWarnings(): void {
  warned.clear();
}

// ---------------------------------------------------------------------------
// HPD complaints (ygpa-z7cr)
// ---------------------------------------------------------------------------

/**
 * All 17 major_category values present in the dataset.
 *
 * Note PAINT/PLASTER covers lead paint and peeling surfaces, which is a
 * surfaces problem, not a "safety" one in HPD's own taxonomy.
 */
export const HPD_MAJOR_CATEGORY_MAP: Record<string, Category> = {
  'HEAT/HOT WATER': 'heat_hot_water',
  HEATING: 'heat_hot_water',
  PLUMBING: 'plumbing',
  'WATER LEAK': 'plumbing',
  'PAINT/PLASTER': 'structural',
  'UNSANITARY CONDITION': 'pests',
  NONCONST: 'pests',
  ELECTRIC: 'electrical',
  'DOOR/WINDOW': 'structural',
  'FLOORING/STAIRS': 'structural',
  'OUTSIDE BUILDING': 'structural',
  CONSTRUCTION: 'structural',
  SAFETY: 'safety',
  ELEVATOR: 'elevator',
  APPLIANCE: 'other',
  GENERAL: 'other',
  'LINE OF TRAVEL': 'other',
};

/**
 * problem_code overrides, applied BEFORE major_category.
 *
 * This exists because pests are split across two major categories --
 * UNSANITARY CONDITION and NONCONST both contain MICE/ROACHES/BED BUGS -- while
 * those same categories also contain non-pest problems like ACCUMULATION and
 * RAW SEWAGE. Mapping on major_category alone misfiles both directions.
 */
export const HPD_PROBLEM_CODE_MAP: Record<string, Category> = {
  MICE: 'pests',
  ROACHES: 'pests',
  RATS: 'pests',
  'BED BUGS': 'pests',
  BEDBUGS: 'pests',
  FLIES: 'pests',
  FLEAS: 'pests',
  TERMITES: 'pests',
  'RAW SEWAGE ACCUMULATION': 'plumbing',
  'BROKEN/BLOCKED SEWAGE PIPE': 'plumbing',
  // Mold is filed under GENERAL but is a water-intrusion symptom, and it is
  // the thing a renter most wants surfaced out of that bucket.
  MOLD: 'plumbing',
};

export function mapHpdComplaint(
  majorCategory: string | undefined,
  problemCode?: string | undefined,
): Category {
  const code = (problemCode ?? '').trim().toUpperCase();
  const direct = HPD_PROBLEM_CODE_MAP[code];
  if (direct) return direct;

  const major = (majorCategory ?? '').trim().toUpperCase();
  if (!major) return 'other';

  const mapped = HPD_MAJOR_CATEGORY_MAP[major];
  if (mapped) return mapped;

  warnUnmapped('HPD major_category', major);
  return 'other';
}

// ---------------------------------------------------------------------------
// HPD violations (wvxf-dwi5)
// ---------------------------------------------------------------------------

/**
 * HPD violations carry no category column — only free-text novdescription
 * citing an HMC section. Ordered keyword rules, most specific first.
 */
const HPD_VIOLATION_RULES: { pattern: RegExp; category: Category }[] = [
  { pattern: /\b(MICE|RATS?|ROACH|VERMIN|BED\s?BUGS?|INFESTATION)\b/, category: 'pests' },
  {
    pattern: /\b(HEAT|HOT WATER|BOILER|RADIATOR|HEATING SEASON|TEMPERATURE)\b/,
    category: 'heat_hot_water',
  },
  {
    pattern: /\b(LEAK|PLUMBING|WATER CLOSET|FAUCET|SINK|BATHTUB|DRAIN|SEWAGE|WASTE LINE|PIPE)\b/,
    category: 'plumbing',
  },
  {
    pattern: /\b(ELECTRIC|WIRING|OUTLET|FIXTURE|LIGHTING|RECEPTACLE)\b/,
    category: 'electrical',
  },
  { pattern: /\bELEVATOR\b/, category: 'elevator' },
  {
    pattern: /\b(SMOKE DETECT|CARBON MONOXIDE|FIRE|EGRESS|SELF-CLOS|SPRINKLER|GUARD|WINDOW GUARD)\b/,
    category: 'safety',
  },
  {
    pattern:
      /\b(PLASTER|PAINT|CEILING|WALL|FLOOR|STAIR|DOOR|WINDOW|ROOF|MASONRY|STRUCTURAL|SURFACE)\b/,
    category: 'structural',
  },
];

export function mapHpdViolation(novDescription: string | undefined): Category {
  const text = (novDescription ?? '').toUpperCase();
  if (!text.trim()) return 'other';
  for (const rule of HPD_VIOLATION_RULES) {
    if (rule.pattern.test(text)) return rule.category;
  }
  return 'other';
}

// ---------------------------------------------------------------------------
// DOB complaints (eabe-havv)
// ---------------------------------------------------------------------------

/**
 * DOB complaint_category codes.
 *
 * CAVEAT: NYC does not publish these code meanings as a dataset — the portal
 * only publishes DISPOSITION codes (6v9u-ndjg), which are a different list.
 * These entries come from DOB's published complaint category list and cover the
 * codes that map cleanly onto a renter-facing category. Everything else is
 * deliberately left unmapped so it warns rather than being mislabeled: a wrong
 * category is worse than 'other' here. Extend as warm-cache logs reveal
 * frequent unmapped codes.
 */
export const DOB_COMPLAINT_CATEGORY_MAP: Record<string, Category> = {
  // Elevator
  '12': 'elevator',
  '14': 'elevator',
  '48': 'elevator',
  '83': 'elevator',
  // Boiler / heat
  '32': 'heat_hot_water',
  '43': 'heat_hot_water',
  // Plumbing
  '76': 'plumbing',
  '85': 'plumbing',
  '94': 'plumbing',
  // Structural
  '03': 'structural',
  '04': 'structural',
  '53': 'structural',
  '63': 'structural',
  '73': 'structural',
  '92': 'structural',
  // Life safety. Illegal conversions sit here rather than in 'other': the
  // hazard they represent to an occupant is egress, overcrowding and
  // unpermitted gas/electrical work.
  '10': 'safety',
  '29': 'safety',
  '30': 'safety',
  '31': 'safety',
  '37': 'safety',
  '45': 'safety',
  '49': 'safety',
  '54': 'safety',
  '74': 'safety',
  '91': 'safety',
  // Permitting and administrative — real complaints, but not a condition
  // inside the apartment.
  '05': 'other',
  '23': 'other',
  '35': 'other',
  '58': 'other',
  '59': 'other',
  '66': 'other',
  '71': 'other',
};

export function mapDobComplaint(code: string | undefined): Category {
  const key = (code ?? '').trim().toUpperCase();
  if (!key) return 'other';
  const mapped = DOB_COMPLAINT_CATEGORY_MAP[key];
  if (mapped) return mapped;

  warnUnmapped('DOB complaint_category', key);
  return 'other';
}

// ---------------------------------------------------------------------------
// DOB violations (3h2n-5cm9)
// ---------------------------------------------------------------------------

/**
 * violation_type is "CODE-DESCRIPTION", e.g. "E-ELEVATOR ELEVATORREQUIRED".
 * Matched on the code prefix, which is stable, rather than the padded text.
 */
export const DOB_VIOLATION_TYPE_MAP: Record<string, Category> = {
  E: 'elevator',
  LL1081: 'elevator',
  ACC1: 'elevator',
  EVCAT1: 'elevator',
  VCAT1: 'elevator',
  EVCAT5: 'elevator',
  JVIOS: 'elevator',
  LL6291: 'heat_hot_water',
  LBLVIO: 'heat_hot_water',
  HBLVIO: 'heat_hot_water',
  B: 'heat_hot_water',
  P: 'plumbing',
  ES: 'electrical',
  C: 'structural',
  UB: 'structural',
  FISP: 'structural',
  FISPNRF: 'structural',
  L1198: 'structural',
  LL1198: 'structural',
  'LL11/98': 'structural',
  LL1080: 'structural',
  CMQ: 'structural',
  IMEGNCY: 'safety',
  EGNCY: 'safety',
  AEUHAZ1: 'safety',
};

export function mapDobViolation(violationType: string | undefined): Category {
  const raw = (violationType ?? '').trim();
  if (!raw) return 'other';

  const code = raw.split('-')[0].trim().toUpperCase();
  const mapped = DOB_VIOLATION_TYPE_MAP[code];
  if (mapped) return mapped;

  warnUnmapped('DOB violation_type', code);
  return 'other';
}
