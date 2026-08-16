import type { BuildingReport, Pattern, RecordDetail } from '@/lib/types';
import { DATASETS, datasetUrl } from '@/lib/nyc/datasets';

/**
 * Demo fixture: a bad Bronx walkup. 12 units, 41 lifetime HPD complaints,
 * 11 open violations, heat + plumbing heavy, bedbug filing on record.
 *
 * Score is the frozen formula applied to the numbers below, by hand:
 *   100
 *   - 24  (2 open class C x 12)
 *   -  8  (2 open class B x 4)
 *   - 14  (14 HPD complaints in 24mo x 1, x 12/max(12,4) = x1.0)
 *   - 10  (bedbug reported within 2y)
 *   = 44  -> grade D
 *
 * Invariants worth preserving if you edit this:
 *  - openCount sums to stats.openViolations (11). Each violation classifies
 *    into exactly one category, so this one is exact.
 *  - category count24mo/countAllTime deliberately OVERSUM the complaint totals
 *    (20 vs 14, and 47 vs 41). That is what real data does: one complaint can
 *    raise problems in several categories and is counted in each. Measured on
 *    344 E 28th St, 18 of 67 complaints spanned more than one category and the
 *    per-category sum came to 113 against a true total of 67. Keep the
 *    oversum here so the UI is built against reality, not against a tidier
 *    fixture.
 *  - timeline is exactly 40 events sorted newest first.
 */
export const mockReport: BuildingReport = {
  address: '1520 Sheridan Avenue, Bronx, NY 10457',
  bbl: '2028130037',
  bin: '2008765',
  borough: 'Bronx',
  lat: 40.83942,
  lng: -73.91283,
  unitCount: 12,
  yearBuilt: 1927,
  grade: 'D',
  score: 44,
  stats: {
    hpdComplaintsAllTime: 41,
    hpdComplaints24mo: 14,
    openViolations: 11,
    closedViolations: 63,
    classCViolations: 2,
    classBViolations: 2,
    dobComplaints24mo: 3,
    complaintsPerUnitPerYear: 0.58,
    cityMedianPerUnitPerYear: 0.28,
  },
  categories: [
    {
      key: 'heat_hot_water',
      label: 'Heat & Hot Water',
      count24mo: 6,
      countAllTime: 17,
      openCount: 3,
      severity: 'high',
    },
    {
      key: 'plumbing',
      label: 'Plumbing & Leaks',
      count24mo: 5,
      countAllTime: 13,
      openCount: 3,
      severity: 'high',
    },
    {
      key: 'pests',
      label: 'Pests & Vermin',
      count24mo: 3,
      countAllTime: 7,
      openCount: 2,
      severity: 'high',
    },
    {
      key: 'electrical',
      label: 'Electrical',
      count24mo: 1,
      countAllTime: 3,
      openCount: 1,
      severity: 'medium',
    },
    {
      key: 'structural',
      label: 'Structural & Surfaces',
      count24mo: 3,
      countAllTime: 4,
      openCount: 1,
      severity: 'medium',
    },
    {
      key: 'safety',
      label: 'Fire & Safety',
      count24mo: 0,
      countAllTime: 1,
      openCount: 1,
      severity: 'medium',
    },
    {
      key: 'elevator',
      label: 'Elevator',
      count24mo: 0,
      countAllTime: 0,
      openCount: 0,
      severity: 'low',
    },
    {
      key: 'other',
      label: 'Other',
      count24mo: 2,
      countAllTime: 2,
      openCount: 0,
      severity: 'low',
    },
  ],
  timeline: [
    {
      date: '2026-07-28',
      source: 'HPD_COMPLAINT',
      category: 'heat_hot_water',
      status: 'open',
      description: 'No heat building-wide — 62°F recorded in apartment at 7:00 AM',
      className: null,
    },
    {
      date: '2026-07-19',
      source: 'HPD_VIOLATION',
      category: 'heat_hot_water',
      status: 'open',
      description: 'Failure to provide adequate heat during heating season',
      className: 'C',
    },
    {
      date: '2026-07-11',
      source: 'HPD_COMPLAINT',
      category: 'plumbing',
      status: 'closed',
      description: 'Water leaking through ceiling into apartment 3A',
      className: null,
    },
    {
      date: '2026-07-02',
      source: 'HPD_VIOLATION',
      category: 'plumbing',
      status: 'open',
      description: 'Defective faucet and active leak at kitchen sink, apartment 4B',
      className: 'B',
    },
    {
      date: '2026-06-30',
      source: 'HPD_VIOLATION',
      category: 'pests',
      status: 'open',
      description: 'Failure to abate bedbug infestation in dwelling units',
      className: 'C',
    },
    {
      date: '2026-06-27',
      source: 'HPD_COMPLAINT',
      category: 'pests',
      status: 'open',
      description: 'Bedbugs reported in bedroom and public hallway, apartment 5A',
      className: null,
    },
    {
      date: '2026-06-11',
      source: 'HPD_VIOLATION',
      category: 'plumbing',
      status: 'open',
      description: 'Replace missing escutcheon plate at radiator riser, apartment 2A',
      className: 'A',
    },
    {
      date: '2026-05-30',
      source: 'HPD_COMPLAINT',
      category: 'heat_hot_water',
      status: 'closed',
      description: 'No hot water at kitchen and bathroom taps',
      className: null,
    },
    {
      date: '2026-05-22',
      source: 'HPD_VIOLATION',
      category: 'structural',
      status: 'open',
      description: 'Broken and defective plastered ceiling surface, 3rd floor public hall',
      className: 'B',
    },
    {
      date: '2026-05-13',
      source: 'DOB_COMPLAINT',
      category: 'structural',
      status: 'closed',
      description: 'Illegal work — interior partition installed without permit',
      className: null,
    },
    {
      date: '2026-05-04',
      source: 'HPD_VIOLATION',
      category: 'heat_hot_water',
      status: 'open',
      description: 'Post notice of heating season complaint procedure in public hall',
      className: 'A',
    },
    {
      date: '2026-04-25',
      source: 'HPD_VIOLATION',
      category: 'heat_hot_water',
      status: 'closed',
      description: 'Failure to maintain required heat — corrected and certified',
      className: 'B',
    },
    {
      date: '2026-04-16',
      source: 'HPD_VIOLATION',
      category: 'electrical',
      status: 'open',
      description: 'Replace missing cover plate at hallway outlet, 2nd floor',
      className: 'A',
    },
    {
      date: '2026-04-02',
      source: 'HPD_COMPLAINT',
      category: 'plumbing',
      status: 'closed',
      description: 'Slow drain and repeated backup in bathroom sink',
      className: null,
    },
    {
      date: '2026-03-28',
      source: 'HPD_VIOLATION',
      category: 'safety',
      status: 'open',
      description: 'Missing smoke detector notice posting in public hall',
      className: 'A',
    },
    {
      date: '2026-03-14',
      source: 'HPD_COMPLAINT',
      category: 'heat_hot_water',
      status: 'closed',
      description: 'Inadequate heat overnight, apartment 4B',
      className: null,
    },
    {
      date: '2026-03-09',
      source: 'HPD_VIOLATION',
      category: 'heat_hot_water',
      status: 'open',
      description: 'Post certificate of boiler inspection in boiler room',
      className: 'A',
    },
    {
      date: '2026-02-19',
      source: 'HPD_VIOLATION',
      category: 'pests',
      status: 'open',
      description: 'Maintain pest-proof condition — openings at baseboard, apartment 1A',
      className: 'A',
    },
    {
      date: '2026-02-11',
      source: 'HPD_VIOLATION',
      category: 'plumbing',
      status: 'open',
      description: 'Repair leaky faucet washer at bathtub, apartment 2A',
      className: 'A',
    },
    {
      date: '2026-02-05',
      source: 'HPD_COMPLAINT',
      category: 'electrical',
      status: 'closed',
      description: 'Outlet sparking in living room, apartment 1B',
      className: null,
    },
    {
      date: '2026-01-27',
      source: 'HPD_COMPLAINT',
      category: 'heat_hot_water',
      status: 'closed',
      description: 'No heat — radiators cold in two rooms',
      className: null,
    },
    {
      date: '2026-01-09',
      source: 'HPD_VIOLATION',
      category: 'pests',
      status: 'closed',
      description: 'Roach infestation in dwelling unit — abated and certified',
      className: 'C',
    },
    {
      date: '2025-12-08',
      source: 'HPD_COMPLAINT',
      category: 'heat_hot_water',
      status: 'closed',
      description: 'No hot water for three consecutive days',
      className: null,
    },
    {
      date: '2025-11-16',
      source: 'HPD_COMPLAINT',
      category: 'plumbing',
      status: 'closed',
      description: 'Leak under kitchen sink, cabinet water damaged',
      className: null,
    },
    {
      date: '2025-10-12',
      source: 'HPD_COMPLAINT',
      category: 'structural',
      status: 'closed',
      description: 'Ceiling plaster falling in public hallway',
      className: null,
    },
    {
      date: '2025-09-03',
      source: 'HPD_COMPLAINT',
      category: 'pests',
      status: 'closed',
      description: 'Mice in kitchen, holes near baseboard',
      className: null,
    },
    {
      date: '2025-08-29',
      source: 'DOB_COMPLAINT',
      category: 'safety',
      status: 'closed',
      description: 'Failure to maintain building — loose facade brick reported',
      className: null,
    },
    {
      date: '2025-07-18',
      source: 'HPD_VIOLATION',
      category: 'plumbing',
      status: 'closed',
      description: 'Defective waste line at apartment 3A — corrected',
      className: 'B',
    },
    {
      date: '2025-06-21',
      source: 'HPD_COMPLAINT',
      category: 'plumbing',
      status: 'closed',
      description: 'Toilet running continuously, apartment 2C',
      className: null,
    },
    {
      date: '2025-04-03',
      source: 'HPD_VIOLATION',
      category: 'safety',
      status: 'closed',
      description: 'Missing self-closing hardware on entrance door — corrected',
      className: 'A',
    },
    {
      date: '2025-02-19',
      source: 'HPD_COMPLAINT',
      category: 'heat_hot_water',
      status: 'closed',
      description: 'Inadequate heat, entire apartment line',
      className: null,
    },
    {
      date: '2025-01-30',
      source: 'DOB_COMPLAINT',
      category: 'electrical',
      status: 'closed',
      description: 'Electrical work performed without permit',
      className: null,
    },
    {
      date: '2024-11-21',
      source: 'HPD_VIOLATION',
      category: 'heat_hot_water',
      status: 'closed',
      description: 'Failure to provide hot water — corrected and certified',
      className: 'C',
    },
    {
      date: '2024-06-14',
      source: 'HPD_VIOLATION',
      category: 'electrical',
      status: 'closed',
      description: 'Exposed wiring in public hall — corrected',
      className: 'B',
    },
    {
      date: '2024-02-27',
      source: 'HPD_VIOLATION',
      category: 'structural',
      status: 'closed',
      description: 'Defective floor tiles in public hall — corrected',
      className: 'A',
    },
    {
      date: '2023-12-05',
      source: 'HPD_COMPLAINT',
      category: 'heat_hot_water',
      status: 'closed',
      description: 'No heat — third occurrence this heating season',
      className: null,
    },
    {
      date: '2023-08-16',
      source: 'HPD_COMPLAINT',
      category: 'plumbing',
      status: 'closed',
      description: 'Sewage backup in basement',
      className: null,
    },
    {
      date: '2023-03-22',
      source: 'DOB_VIOLATION',
      category: 'safety',
      status: 'closed',
      description: 'Failure to file annual boiler inspection report',
      className: null,
    },
    {
      date: '2022-10-07',
      source: 'HPD_COMPLAINT',
      category: 'pests',
      status: 'closed',
      description: 'Roaches throughout apartment',
      className: null,
    },
    {
      date: '2022-01-19',
      source: 'HPD_COMPLAINT',
      category: 'other',
      status: 'closed',
      description: 'Broken lock at building entrance door',
      className: null,
    },
  ],
  scoreBreakdown: {
    start: 100,
    classCCount: 2,
    classCPenalty: 24,
    classBCount: 2,
    classBPenalty: 8,
    complaintCount: 14,
    complaintPenaltyBeforeScaling: 14,
    unitScaleFactor: 1,
    complaintPenalty: 14,
    bedbugReported: true,
    bedbugPenalty: 10,
    openViolations: 11,
    cleanBonus: 0,
    rawTotal: 44,
    finalScore: 44,
  },
  patterns: [
    {
      key: 'recurring_heat_hot_water',
      label: 'Recurring heat & hot water issues',
      description: '6 heat & hot water complaints filed in the last 24 months.',
      severity: 'high',
      category: 'heat_hot_water',
      statusFilter: null,
      classFilter: null,
    },
    {
      key: 'recurring_plumbing',
      label: 'Recurring plumbing & leaks issues',
      description: '5 plumbing & leaks complaints filed in the last 24 months.',
      severity: 'high',
      category: 'plumbing',
      statusFilter: null,
      classFilter: null,
    },
    {
      key: 'recurring_pests',
      label: 'Recurring pests & vermin issues',
      description: '3 pests & vermin complaints filed in the last 24 months.',
      severity: 'high',
      category: 'pests',
      statusFilter: null,
      classFilter: null,
    },
    {
      key: 'recurring_structural',
      label: 'Recurring structural & surfaces issues',
      description: '3 structural & surfaces complaints filed in the last 24 months.',
      severity: 'medium',
      category: 'structural',
      statusFilter: null,
      classFilter: null,
    },
    {
      key: 'unresolved_class_c',
      label: 'Unresolved immediately-hazardous violations',
      description: "2 open class C violations — the city's most serious tier — still unresolved.",
      severity: 'high',
      category: null,
      statusFilter: 'open',
      classFilter: 'C',
    },
    {
      key: 'seasonal_heat',
      label: 'Heat outages recur every heating season',
      description: 'Heat or hot water complaints were filed in 3 different heating seasons on record.',
      severity: 'high',
      category: 'heat_hot_water',
      statusFilter: null,
      classFilter: null,
    },
  ],
  bedbug: { reported: true, infestedUnits: 3, year: 2026 },
  narrative: null,
  dataAsOf: '2026-08-14T18:00:00.000Z',
  dataQuality: {
    unitCountKnown: true,
    matchedBin: true,
    warnings: [
      'DOB records matched by BIN only; filings made under a prior BIN may not appear.',
    ],
  },
  sources: [
    {
      name: 'HPD Complaints',
      datasetId: 'uwyv-629c',
      url: 'https://data.cityofnewyork.us/resource/uwyv-629c.json',
    },
    {
      name: 'HPD Complaint Problems',
      datasetId: 'a2nx-4u46',
      url: 'https://data.cityofnewyork.us/resource/a2nx-4u46.json',
    },
    {
      name: 'HPD Violations',
      datasetId: 'wvxf-dwi5',
      url: 'https://data.cityofnewyork.us/resource/wvxf-dwi5.json',
    },
    {
      name: 'DOB Complaints',
      datasetId: 'eabe-havv',
      url: 'https://data.cityofnewyork.us/resource/eabe-havv.json',
    },
    {
      name: 'DOB Violations',
      datasetId: '3h2n-5cm9',
      url: 'https://data.cityofnewyork.us/resource/3h2n-5cm9.json',
    },
    {
      name: 'HPD Bedbug Reporting',
      datasetId: 'wz6d-d3jb',
      url: 'https://data.cityofnewyork.us/resource/wz6d-d3jb.json',
    },
    {
      name: 'HPD Housing Registrations',
      datasetId: 'tesw-yqqr',
      url: 'https://data.cityofnewyork.us/resource/tesw-yqqr.json',
    },
  ],
};

/**
 * Shape reference for POST /api/narrative. Not attached to the report —
 * /api/building always returns narrative: null. Use this to build the
 * narrative UI before step 6 lands.
 */
export const mockNarrative: NonNullable<BuildingReport['narrative']> = {
  summary:
    'The public record for this 12-unit building shows 14 HPD complaints in the last 24 months, about twice the citywide rate per unit, concentrated in heat and hot water. Eleven violations are currently open, two of them class C (immediately hazardous). A bedbug infestation affecting three units was filed in 2026.',
  redFlags: [
    'Two open class C violations, the city’s immediately-hazardous tier.',
    'Six heat and hot water complaints in 24 months, across two heating seasons.',
    'Bedbug infestation reported in three units in 2026, with an open violation for failure to abate.',
    'Repeat plumbing leaks: three open plumbing violations and four complaints in 24 months.',
  ],
  questionsToAsk: [
    'What is the current status of the two open class C violations, and when is correction scheduled?',
    'Was the 2026 bedbug treatment completed building-wide, and can I see the treatment records?',
    'How old is the boiler, and was it replaced or serviced after last winter’s heat complaints?',
    'Which unit had the recurring ceiling leak, and what repair was done to the line above it?',
  ],
};

const SOURCE_DATASET: Record<RecordDetail['source'], { id: string; idField: string }> = {
  HPD_COMPLAINT: { id: DATASETS.hpdComplaints.id, idField: 'complaint_id' },
  HPD_VIOLATION: { id: DATASETS.hpdViolations.id, idField: 'violationid' },
  DOB_COMPLAINT: { id: DATASETS.dobComplaints.id, idField: 'complaint_number' },
  DOB_VIOLATION: { id: DATASETS.dobViolations.id, idField: 'violation_number' },
};

/** Pulls "apartment 3A" -> "3A" out of the fixture's own description text, rather than inventing unit data. */
function unitFromDescription(description: string): string | null {
  const match = /apartment\s+([A-Za-z0-9]+)/i.exec(description);
  return match ? match[1] : null;
}

/**
 * Shape reference for GET /api/building/records. Not attached to the report
 * — that endpoint is fetched separately from /api/building. Derived from
 * mockReport.timeline so the two never drift apart; ids and sourceUrls are
 * synthetic (this whole fixture is hand-authored, not a real BBL).
 */
export const mockRecords: RecordDetail[] = mockReport.timeline.map((event, index) => {
  const id = `mock-${index + 1}`;
  const { id: datasetId, idField } = SOURCE_DATASET[event.source];
  return {
    id,
    date: event.date,
    source: event.source,
    category: event.category,
    status: event.status,
    className: event.className,
    description: event.description,
    unit: event.source === 'HPD_COMPLAINT' || event.source === 'HPD_VIOLATION'
      ? unitFromDescription(event.description)
      : null,
    sourceUrl: `${datasetUrl(datasetId)}?${idField}=${encodeURIComponent(id)}`,
  };
});
