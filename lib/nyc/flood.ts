/**
 * Flood exposure lookup for a single point, from two official NYC layers.
 *
 * Deliberately kept out of BuildingReport: the frozen contract has no flood
 * field, and the report's grade and score must not move because of this. Flood
 * exposure is a separate, additive signal fetched on its own.
 *
 * Both sources are ArcGIS FeatureServers, not Socrata, so this module does not
 * share the Socrata circuit breaker — a flood outage must never stop building
 * reports from loading.
 */

/** Coarse exposure bands. `unavailable` means we could not reach the data. */
export type FloodLevel = 'low' | 'potential' | 'higher' | 'unavailable';

export interface FloodSource {
  name: string;
  url: string;
}

export interface FloodRisk {
  level: FloodLevel;
  /** Hedged, public-record phrasing. Never asserts that a unit will flood. */
  headline: string;
  /** What each layer actually said, one line per source that answered. */
  findings: string[];
  /** Questions worth asking at the viewing. Empty when there is no signal. */
  questions: string[];
  sources: FloodSource[];
  checkedAt: string;
}

const STORMWATER_LAYER =
  'https://services.arcgis.com/g8EzU2gNHvGpFUGY/ArcGIS/rest/services/New_York_City_Map_WFL1/FeatureServer/1/query';

const HURRICANE_LAYER =
  'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/ArcGIS/rest/services/NYC_Hurricane_Evacuation_Zone/FeatureServer/0/query';

const SOURCES: Record<'stormwater' | 'hurricane', FloodSource> = {
  stormwater: {
    name: 'NYC Stormwater Flood Map — Moderate Flood, Current Sea Levels (DEP)',
    url: 'https://data.cityofnewyork.us/Environment/NYC-Stormwater-Flood-Map-Moderate-Flood-with-Curre/7r5q-vr7p',
  },
  hurricane: {
    name: 'NYC Hurricane Evacuation Zones (NYC Emergency Management)',
    url: 'https://data.cityofnewyork.us/City-Government/Hurricane-Evacuation-Zones/epne-qv9x',
  },
};

/**
 * The stormwater map masks out buildings and roadbeds, so an exact point often
 * falls in a gap even mid-flood-zone. A small buffer is what makes the answer
 * meaningful — and it is why the copy says "near this property" rather than
 * "at this address".
 */
const STORMWATER_BUFFER_METRES = 150;

const REQUEST_TIMEOUT_MS = 6000;

/** Flood polygons are static, so cache hard and key on a rounded point. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: FloodRisk }>();

/** ~11m of precision, plenty for a building footprint. */
function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

export class FloodInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FloodInputError';
  }
}

/** NYC's bounding box, so we reject obvious nonsense before making a request. */
const NYC_BOUNDS = { minLat: 40.47, maxLat: 40.93, minLng: -74.28, maxLng: -73.68 };

export function parseCoordinates(rawLat: unknown, rawLng: unknown): { lat: number; lng: number } {
  // Number(null) is 0, so absent params must be rejected before coercion or
  // they masquerade as the "lot has no coordinates" case.
  const missing = (value: unknown) =>
    value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
  if (missing(rawLat) || missing(rawLng)) {
    throw new FloodInputError('Both lat and lng are required.');
  }

  const lat = Number(rawLat);
  const lng = Number(rawLng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new FloodInputError('lat and lng must both be numbers.');
  }
  // The report itself uses 0/0 when PLUTO has no coordinate for a lot.
  if (lat === 0 && lng === 0) {
    throw new FloodInputError('No coordinates are available for this building.');
  }
  if (
    lat < NYC_BOUNDS.minLat ||
    lat > NYC_BOUNDS.maxLat ||
    lng < NYC_BOUNDS.minLng ||
    lng > NYC_BOUNDS.maxLng
  ) {
    throw new FloodInputError('Those coordinates are outside New York City.');
  }

  return { lat, lng };
}

interface ArcGisFeature {
  attributes?: Record<string, unknown>;
}

interface ArcGisResponse {
  features?: ArcGisFeature[];
  error?: { message?: string };
}

async function queryLayer(
  url: string,
  lat: number,
  lng: number,
  outFields: string,
  bufferMetres?: number,
): Promise<ArcGisFeature[]> {
  const params = new URLSearchParams({
    geometry: JSON.stringify({ x: lng, y: lat }),
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields,
    returnGeometry: 'false',
    where: '1=1',
    f: 'json',
  });

  if (bufferMetres) {
    params.set('distance', String(bufferMetres));
    params.set('units', 'esriSRUnit_Meter');
  }

  const response = await fetch(`${url}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const body = (await response.json()) as ArcGisResponse;
  // ArcGIS reports failures inside a 200 response, so this must be checked.
  if (body.error) throw new Error(body.error.message ?? 'ArcGIS error');

  return body.features ?? [];
}

/** Flooding_Category: 1 = nuisance (4in–1ft), 2 = deep and contiguous (1ft+). */
async function stormwaterCategories(lat: number, lng: number): Promise<number[]> {
  const features = await queryLayer(
    STORMWATER_LAYER,
    lat,
    lng,
    'Flooding_Category',
    STORMWATER_BUFFER_METRES,
  );

  const categories = new Set<number>();
  for (const feature of features) {
    const value = Number(feature.attributes?.Flooding_Category);
    if (Number.isInteger(value)) categories.add(value);
  }
  return Array.from(categories).sort();
}

/** Zone 1 is evacuated first; 'X' means the point is in no zone at all. */
async function hurricaneZone(lat: number, lng: number): Promise<string | null> {
  const features = await queryLayer(HURRICANE_LAYER, lat, lng, 'HURRICANE_EVACUATION_ZONE');

  for (const feature of features) {
    const raw = feature.attributes?.HURRICANE_EVACUATION_ZONE;
    if (typeof raw === 'string' && raw.trim() !== '') {
      const zone = raw.trim().toUpperCase();
      return zone === 'X' ? null : zone;
    }
  }
  return null;
}

const QUESTIONS = [
  'Has this apartment ever flooded?',
  'Has water ever entered the basement?',
  'Have there been previous water-damage repairs?',
  'Is there a sump pump or other drainage system?',
  'Where can belongings be moved during a severe storm?',
];

export async function getFloodRisk(lat: number, lng: number): Promise<FloodRisk> {
  const key = cacheKey(lat, lng);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const [stormwater, hurricane] = await Promise.allSettled([
    stormwaterCategories(lat, lng),
    hurricaneZone(lat, lng),
  ]);

  // Only claim "no known signal" when at least one layer actually answered.
  if (stormwater.status === 'rejected' && hurricane.status === 'rejected') {
    return {
      level: 'unavailable',
      headline: 'Flood mapping could not be reached right now.',
      findings: [],
      questions: [],
      sources: [SOURCES.stormwater, SOURCES.hurricane],
      checkedAt: new Date().toISOString(),
    };
  }

  const categories = stormwater.status === 'fulfilled' ? stormwater.value : [];
  const zone = hurricane.status === 'fulfilled' ? hurricane.value : null;

  const findings: string[] = [];
  const sources: FloodSource[] = [];

  if (stormwater.status === 'fulfilled') {
    sources.push(SOURCES.stormwater);
    if (categories.includes(2)) {
      findings.push(
        'Public stormwater mapping shows areas of deep or contiguous flooding (1 foot or more) near this property during heavy rainfall.',
      );
    } else if (categories.includes(1)) {
      findings.push(
        'Public stormwater mapping shows areas of shallower nuisance flooding (about 4 inches to 1 foot) near this property during heavy rainfall.',
      );
    } else {
      findings.push('Public stormwater mapping shows no modelled flooding near this property.');
    }
  }

  if (hurricane.status === 'fulfilled') {
    sources.push(SOURCES.hurricane);
    findings.push(
      zone
        ? `This property sits in NYC hurricane evacuation zone ${zone}, meaning the city plans for possible storm-surge evacuation here.`
        : 'This property is not inside any NYC hurricane evacuation zone.',
    );
  }

  const zoneNumber = zone ? Number(zone) : null;
  const highSurge = zoneNumber !== null && Number.isFinite(zoneNumber) && zoneNumber <= 2;

  let level: FloodLevel;
  if (categories.includes(2) || highSurge) level = 'higher';
  else if (categories.includes(1) || zone !== null) level = 'potential';
  else level = 'low';

  const headline =
    level === 'higher'
      ? 'Public flood mapping indicates potential stormwater flood exposure near this property, including deeper flooding or a storm-surge evacuation zone.'
      : level === 'potential'
        ? 'Public flood mapping indicates potential stormwater flood exposure near this property.'
        : 'Public flood mapping shows no known flood signal near this property.';

  const value: FloodRisk = {
    level,
    headline,
    findings,
    questions: level === 'low' ? [] : QUESTIONS,
    sources,
    checkedAt: new Date().toISOString(),
  };

  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Test seam. */
export function clearFloodCache(): void {
  cache.clear();
}
