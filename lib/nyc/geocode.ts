import type { AddressCandidate } from '@/lib/types';

const GEOSEARCH_URL = 'https://geosearch.planninglabs.nyc/v2/search';

/** Ask for more than we return: results are deduped by BBL before slicing to 5. */
const REQUEST_SIZE = 15;
const MAX_CANDIDATES = 5;
const TIMEOUT_MS = 6000;

/**
 * Thrown when geosearch itself is unreachable or misbehaving. The route maps
 * this to UPSTREAM_DOWN. A successful search with no matches is NOT an error —
 * it returns an empty array.
 */
export class GeocodeUpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeocodeUpstreamError';
  }
}

/**
 * Shape confirmed against the live API on 2026-08-15. bbl/bin sit at
 * properties.addendum.pad — everything here is optional because the geocoder
 * returns several layers (venue, street, locality) and only building-level
 * results carry a pad addendum.
 */
interface GeoSearchFeature {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: {
    label?: string;
    name?: string;
    borough?: string;
    confidence?: number;
    layer?: string;
    addendum?: { pad?: { bbl?: string; bin?: string } };
  };
}

interface GeoSearchResponse {
  features?: GeoSearchFeature[];
}

const BOROUGH_BY_BBL_PREFIX: Record<string, string> = {
  '1': 'Manhattan',
  '2': 'Bronx',
  '3': 'Brooklyn',
  '4': 'Queens',
  '5': 'Staten Island',
};

/** A 10-digit BBL: 1 borough digit (1-5) + 5-digit block + 4-digit lot. */
function normalizeBbl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const bbl = raw.trim();
  return /^[1-5]\d{9}$/.test(bbl) ? bbl : null;
}

/**
 * NYC uses "million BINs" (1000000, 2000000, ...) as a borough-level placeholder
 * meaning "no specific building". Those are not real BINs — treat them as unknown
 * so downstream lookups don't match every building in the borough.
 */
function normalizeBin(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const bin = raw.trim();
  if (!/^[1-5]\d{6}$/.test(bin)) return null;
  if (/^[1-5]000000$/.test(bin)) return null;
  return bin;
}

function normalizeCoords(coordinates: unknown): { lat: number; lng: number } | null {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const [lng, lat] = coordinates; // GeoJSON is [lng, lat]
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function toCandidate(feature: GeoSearchFeature): AddressCandidate | null {
  const props = feature.properties;
  if (!props) return null;

  const bbl = normalizeBbl(props.addendum?.pad?.bbl);
  if (!bbl) return null; // no BBL means we can't build a report for it

  const coords = normalizeCoords(feature.geometry?.coordinates);
  if (!coords) return null;

  const label = props.label ?? props.name;
  if (!label) return null;

  const confidence = typeof props.confidence === 'number' ? props.confidence : 0;

  return {
    label,
    bbl,
    bin: normalizeBin(props.addendum?.pad?.bin),
    borough: props.borough ?? BOROUGH_BY_BBL_PREFIX[bbl[0]] ?? '',
    lat: coords.lat,
    lng: coords.lng,
    confidence: Math.min(Math.max(confidence, 0), 1),
  };
}

/**
 * Geocode a free-text NYC address to at most 5 candidates.
 *
 * No matches resolves to an empty array — only transport/HTTP failures throw.
 * Results are deduped by BBL: the geocoder returns one feature per address
 * point, so "350 5 Avenue" / "350A 5 Avenue" / "350B 5 Avenue" are three
 * features for one building, and three identical report targets is a wasted
 * picker. The highest-ranked feature for each BBL wins.
 */
export async function geocodeAddress(query: string): Promise<AddressCandidate[]> {
  const text = query.trim();
  if (!text) return [];

  const url = new URL(GEOSEARCH_URL);
  url.searchParams.set('text', text);
  url.searchParams.set('size', String(REQUEST_SIZE));

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : 'unknown error';
    throw new GeocodeUpstreamError(`geosearch request failed: ${reason}`);
  }

  if (!response.ok) {
    throw new GeocodeUpstreamError(`geosearch returned HTTP ${response.status}`);
  }

  let body: GeoSearchResponse;
  try {
    body = (await response.json()) as GeoSearchResponse;
  } catch {
    throw new GeocodeUpstreamError('geosearch returned a malformed response');
  }

  const features = Array.isArray(body.features) ? body.features : [];
  const seen = new Set<string>();
  const candidates: AddressCandidate[] = [];

  for (const feature of features) {
    const candidate = toCandidate(feature);
    if (!candidate || seen.has(candidate.bbl)) continue;
    seen.add(candidate.bbl);
    candidates.push(candidate);
    if (candidates.length === MAX_CANDIDATES) break;
  }

  return candidates;
}
