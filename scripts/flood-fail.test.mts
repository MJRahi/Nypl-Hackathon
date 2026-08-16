/**
 * The failure paths for flood lookup. The report must survive flood mapping
 * being down, so the only acceptable outcome here is a clean `unavailable`.
 *
 * Run: npx tsx scripts/flood-fail.test.mts
 */
import { clearFloodCache, getFloodRisk, parseCoordinates, FloodInputError } from '../lib/nyc/flood';

const realFetch = globalThis.fetch;
let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function bothLayersDown(): Promise<void> {
  clearFloodCache();
  globalThis.fetch = (() => Promise.reject(new Error('network down'))) as typeof fetch;
  const flood = await getFloodRisk(40.72382, -73.95107);
  globalThis.fetch = realFetch;

  check('both layers down -> unavailable', flood.level === 'unavailable', flood.level);
  check('unavailable offers no questions', flood.questions.length === 0);
  check('unavailable never claims a signal', !/no known flood signal/i.test(flood.headline));
}

async function layersReturnHttpError(): Promise<void> {
  clearFloodCache();
  globalThis.fetch = (() =>
    Promise.resolve(new Response('boom', { status: 500 }))) as unknown as typeof fetch;
  const flood = await getFloodRisk(40.72382, -73.95107);
  globalThis.fetch = realFetch;

  check('HTTP 500 from both layers -> unavailable', flood.level === 'unavailable', flood.level);
}

async function arcgisErrorInsideA200(): Promise<void> {
  clearFloodCache();
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ error: { message: 'Invalid query parameters.' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )) as unknown as typeof fetch;
  const flood = await getFloodRisk(40.72382, -73.95107);
  globalThis.fetch = realFetch;

  check('ArcGIS error inside a 200 -> unavailable', flood.level === 'unavailable', flood.level);
}

async function onlyOneLayerDown(): Promise<void> {
  clearFloodCache();
  // Fail stormwater, let the hurricane layer answer for real.
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('New_York_City_Map_WFL1')) return Promise.reject(new Error('down'));
    return realFetch(input, init);
  }) as typeof fetch;
  const flood = await getFloodRisk(40.5755, -73.9707); // Coney Island, evacuation zone 1
  globalThis.fetch = realFetch;

  check('one layer down still yields an answer', flood.level !== 'unavailable', flood.level);
  check('surviving layer drives the level', flood.level === 'higher', flood.level);
  check('only the layer that answered is cited', flood.sources.length === 1, `${flood.sources.length}`);
}

function inputValidation(): void {
  const bad: [string, unknown, unknown][] = [
    ['missing both', null, null],
    ['non-numeric', 'abc', '-73.9'],
    ['null island', 0, 0],
    ['outside NYC', 51.5, -0.12],
  ];
  for (const [label, lat, lng] of bad) {
    let threw = false;
    try {
      parseCoordinates(lat, lng);
    } catch (error) {
      threw = error instanceof FloodInputError;
    }
    check(`rejects ${label}`, threw);
  }
  let ok = true;
  try {
    parseCoordinates('40.72382', '-73.95107');
  } catch {
    ok = false;
  }
  check('accepts a valid NYC point', ok);
}

async function main(): Promise<void> {
  console.log('\nFlood lookup — failure and validation paths\n');
  inputValidation();
  await bothLayersDown();
  await layersReturnHttpError();
  await arcgisErrorInsideA200();
  await onlyOneLayerDown();
  clearFloodCache();

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

void main();
