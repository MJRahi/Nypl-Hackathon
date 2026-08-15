/**
 * Warm the demo fixtures.
 *
 *   npm run warm-cache -- "1520 Sheridan Ave, Bronx" "310 E 70th St, Manhattan"
 *   npm run warm-cache -- --file addresses.txt
 *   npm run warm-cache -- --bbl 2028190005
 *
 * For each address: geocode it, run the real pipeline, and write
 * /public/demo/{bbl}.json. resolveReport() checks that directory before the
 * cache and before any network call, so a committed fixture means the demo
 * renders with the wifi unplugged.
 *
 * Commit the JSON files this writes. They are the demo's safety net.
 *
 * Flags:
 *   --file <path>   read addresses from a file, one per line (# comments ok)
 *   --bbl <bbl>     skip geocoding and use this BBL directly (repeatable)
 *   --narrative     also generate and embed the narrative (see the note below)
 *   --force         overwrite an existing fixture instead of skipping it
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BuildingReport } from '@/lib/types';
import { geocodeAddress } from '@/lib/nyc/geocode';
import { loadBuildingReport } from '@/lib/nyc/report';
import { generateNarrative, toNarrativeInput } from '@/lib/nyc/narrative';

const DEMO_DIR = path.join(process.cwd(), 'public', 'demo');

interface Options {
  addresses: string[];
  bbls: string[];
  withNarrative: boolean;
  force: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { addresses: [], bbls: [], withNarrative: false, force: false };
  const fileArgs: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--narrative') opts.withNarrative = true;
    else if (arg === '--force') opts.force = true;
    else if (arg === '--file') fileArgs.push(argv[++i] ?? '');
    else if (arg === '--bbl') opts.bbls.push(argv[++i] ?? '');
    else if (arg.startsWith('--')) throw new Error(`Unknown flag: ${arg}`);
    else opts.addresses.push(arg);
  }

  // Files are read by the caller; stash the paths on the address list marker.
  (opts as Options & { files: string[] }).files = fileArgs;
  return opts;
}

async function readAddressFile(file: string): Promise<string[]> {
  const raw = await readFile(file, 'utf8');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

async function fixtureExists(bbl: string): Promise<boolean> {
  try {
    await readFile(path.join(DEMO_DIR, `${bbl}.json`), 'utf8');
    return true;
  } catch {
    return false;
  }
}

async function writeFixture(report: BuildingReport): Promise<string> {
  await mkdir(DEMO_DIR, { recursive: true });
  const file = path.join(DEMO_DIR, `${report.bbl}.json`);
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return file;
}

/** Resolve a free-text address to a single BBL, or explain why we can't. */
async function resolveBbl(address: string): Promise<{ bbl: string; label: string } | null> {
  const candidates = await geocodeAddress(address);
  if (candidates.length === 0) {
    console.error(`  ✗ no geocoder match for "${address}"`);
    return null;
  }

  const [best, second] = candidates;
  if (second && second.confidence === best.confidence) {
    console.warn(
      `  ! ambiguous: "${address}" also matches ${second.label}. Using ${best.label}.`,
    );
  }
  return { bbl: best.bbl, label: best.label };
}

async function warmOne(
  target: { bbl: string; label: string },
  opts: Options,
): Promise<'written' | 'skipped' | 'failed'> {
  if (!opts.force && (await fixtureExists(target.bbl))) {
    console.log(`  · ${target.bbl} already has a fixture; use --force to refresh.`);
    return 'skipped';
  }

  let report: BuildingReport;
  try {
    report = await loadBuildingReport(target.bbl);
  } catch (cause) {
    console.error(`  ✗ ${target.bbl}: ${cause instanceof Error ? cause.message : cause}`);
    return 'failed';
  }

  if (opts.withNarrative) {
    const narrative = await generateNarrative(toNarrativeInput(report));
    if (narrative) {
      report.narrative = narrative;
      console.log('    narrative embedded');
    } else {
      console.warn('    narrative unavailable; fixture keeps narrative: null');
    }
  }

  const file = await writeFixture(report);
  console.log(
    `  ✓ ${report.address}\n    grade ${report.grade} (${report.score}), ${report.stats.openViolations} open violations, ${report.timeline.length} timeline events`,
  );
  console.log(`    -> ${path.relative(process.cwd(), file)}`);

  if (report.dataQuality.warnings.length > 0) {
    for (const warning of report.dataQuality.warnings) console.warn(`    ! ${warning}`);
  }
  return 'written';
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const files = (opts as Options & { files: string[] }).files ?? [];

  for (const file of files) {
    opts.addresses.push(...(await readAddressFile(file)));
  }

  if (opts.addresses.length === 0 && opts.bbls.length === 0) {
    console.error('Usage: npm run warm-cache -- "<address>" ["<address>" ...] [--bbl <bbl>]');
    console.error('       npm run warm-cache -- --file addresses.txt [--narrative] [--force]');
    process.exitCode = 1;
    return;
  }

  if (!process.env.SOCRATA_APP_TOKEN?.trim()) {
    console.warn(
      'SOCRATA_APP_TOKEN is not set — this run uses the throttled anonymous tier.\n',
    );
  }
  if (opts.withNarrative && !process.env.ANTHROPIC_API_KEY?.trim()) {
    console.warn('ANTHROPIC_API_KEY is not set — --narrative will be skipped.\n');
  }

  const targets: { bbl: string; label: string }[] = opts.bbls.map((bbl) => ({
    bbl,
    label: `BBL ${bbl}`,
  }));

  for (const address of opts.addresses) {
    console.log(`\n${address}`);
    const resolved = await resolveBbl(address);
    if (resolved) targets.push(resolved);
  }

  const tally = { written: 0, skipped: 0, failed: 0 };
  for (const target of targets) {
    if (opts.bbls.includes(target.bbl)) console.log(`\n${target.label}`);
    const outcome = await warmOne(target, opts);
    tally[outcome] += 1;
  }

  console.log(
    `\n${tally.written} written, ${tally.skipped} skipped, ${tally.failed} failed.`,
  );
  if (tally.written > 0) {
    console.log('Commit public/demo/*.json — those files are what make the demo offline-safe.');
  }
  if (tally.failed > 0) process.exitCode = 1;
}

main().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
