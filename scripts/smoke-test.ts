/**
 * End-to-end smoke test against live NYC data.
 *
 *   npm run smoke
 *   npm run smoke -- "123 Main St, Brooklyn"
 *
 * Runs geocode -> full pipeline for a spread of awkward real buildings and
 * asserts the invariants the frontend relies on. Exits non-zero on any
 * violation, so it works as a pre-demo check.
 *
 * The default list is deliberately awkward: commercial towers with no HPD
 * registration, a park, condos with high lot numbers, hyphenated Queens house
 * numbers, and a Staten Island lot with no PLUTO unit count.
 */

import { access } from 'node:fs/promises';
import path from 'node:path';
import { geocodeAddress } from '@/lib/nyc/geocode';
import { loadBuildingReport } from '@/lib/nyc/report';
import { DEMO_ADDRESSES } from '@/components/search/demoData';
import type { BuildingReport } from '@/lib/types';

const DEFAULT_CASES: [address: string, why: string][] = [
  ['350 5th Ave, Manhattan', 'commercial tower, not HPD-registered'],
  ['1 Bay St, Staten Island', 'Staten Island, no PLUTO unit count'],
  ['90-02 Queens Blvd, Queens', 'hyphenated Queens house number'],
  ['131 Bergen St, Brooklyn', 'ordinary small Brooklyn walkup'],
  ['465 W 34th St, Manhattan', 'new construction, thin history'],
  ['2440 Boston Rd, Bronx', 'large Bronx complex'],
  ['15 Central Park West, Manhattan', 'condo with high lot numbers'],
  ['344 E 28th St, Manhattan', 'co-op, heavy category overlap'],
  ['Central Park', 'not a building at all'],
];

/**
 * Invariants the UI depends on. Note what is NOT asserted: category complaint
 * counts are allowed to exceed the complaint totals, because one complaint can
 * span several categories. Only openCount partitions exactly.
 */
function check(report: BuildingReport): string[] {
  const problems: string[] = [];
  const sumOpen = report.categories.reduce((a, c) => a + c.openCount, 0);

  if (sumOpen !== report.stats.openViolations) {
    problems.push(`openCount sums to ${sumOpen}, stats.openViolations is ${report.stats.openViolations}`);
  }
  if (report.categories.length !== 8) {
    problems.push(`${report.categories.length} categories, expected 8`);
  }
  if (report.timeline.length > 40) {
    problems.push(`timeline has ${report.timeline.length} events, cap is 40`);
  }
  if (report.timeline.some((e) => !/^\d{4}-\d{2}-\d{2}$/.test(e.date))) {
    problems.push('timeline contains a malformed date');
  }
  if (!report.timeline.every((e, i) => i === 0 || report.timeline[i - 1].date >= e.date)) {
    problems.push('timeline is not sorted newest first');
  }
  if (report.score < 0 || report.score > 100 || !Number.isInteger(report.score)) {
    problems.push(`score ${report.score} is not an integer in 0..100`);
  }
  if (report.narrative !== null) {
    problems.push('narrative should start null');
  }
  if (report.unitCount === null && report.stats.complaintsPerUnitPerYear !== null) {
    problems.push('per-unit rate present without a unit count');
  }
  if (report.unitCount !== null && !report.dataQuality.unitCountKnown) {
    problems.push('unitCount set but unitCountKnown false');
  }
  if (report.sources.length === 0) {
    problems.push('no sources listed');
  }
  if (report.scoreBreakdown.finalScore !== report.score) {
    problems.push(
      `scoreBreakdown.finalScore (${report.scoreBreakdown.finalScore}) !== report.score (${report.score})`,
    );
  }
  if (report.stats.classBViolations < 0 || report.stats.classCViolations < 0) {
    problems.push('classBViolations or classCViolations is negative');
  }
  for (const pattern of report.patterns) {
    if (!pattern.label.trim() || !pattern.description.trim()) {
      problems.push(`pattern "${pattern.key}" has an empty label or description`);
    }
  }
  return problems;
}

/**
 * Every tappable demo building must have a committed fixture, or that button
 * hits the network live on stage. This is the check that catches a demo BBL
 * being added without a matching `npm run warm-cache` run.
 */
async function checkDemoCoverage(): Promise<number> {
  console.log('Demo fixture coverage');
  let missing = 0;

  for (const demo of DEMO_ADDRESSES) {
    const bbl = demo.href.split('/').pop() ?? '';
    const fixture = path.join(process.cwd(), 'public', 'demo', `${bbl}.json`);
    try {
      await access(fixture);
      console.log(`  ${bbl}  ${demo.label} — fixture committed`);
    } catch {
      missing += 1;
      console.log(
        `  ${bbl}  ${demo.label} — NO FIXTURE. Run: npm run warm-cache -- --bbl ${bbl}`,
      );
    }
  }
  return missing;
}

async function main(): Promise<void> {
  const custom = process.argv.slice(2);
  const cases: [string, string][] =
    custom.length > 0 ? custom.map((a) => [a, 'user supplied']) : DEFAULT_CASES;

  let failed = custom.length === 0 ? await checkDemoCoverage() : 0;

  for (const [address, why] of cases) {
    console.log(`\n${address}  (${why})`);
    try {
      const candidates = await geocodeAddress(address);
      if (candidates.length === 0) {
        console.log('  geocode returned no candidates');
        continue;
      }

      const started = Date.now();
      const report = await loadBuildingReport(candidates[0].bbl);
      const problems = check(report);
      if (problems.length > 0) failed += 1;

      console.log(
        `  ${report.bbl} bin=${report.bin ?? 'none'} ${Date.now() - started}ms — grade ${report.grade} (${report.score}), ${report.unitCount ?? '?'} units, built ${report.yearBuilt ?? '?'}`,
      );
      console.log(
        `  complaints ${report.stats.hpdComplaintsAllTime} all time / ${report.stats.hpdComplaints24mo} in 24mo, ${report.stats.openViolations} open violations, ${report.timeline.length} timeline events`,
      );
      console.log(problems.length === 0 ? '  OK' : `  FAILED: ${problems.join('; ')}`);
      for (const warning of report.dataQuality.warnings) console.log(`  ! ${warning}`);
    } catch (cause) {
      failed += 1;
      console.log(`  THREW: ${cause instanceof Error ? cause.message : cause}`);
    }
  }

  console.log(`\n${failed} of ${cases.length} case(s) failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
