import type { BuildingReport } from '@/lib/types';

/**
 * Demo fixture: a well-maintained Upper East Side elevator building.
 * 48 units, no open violations, no bedbug filing.
 *
 * Score, frozen formula by hand:
 *   100
 *   -  0  (no open class C)
 *   -  0  (no open class B)
 *   -  0.5 (2 HPD complaints in 24mo x 1, x 12/max(48,4) = x0.25)
 *   + 10  (zero open violations)
 *   = 109.5 -> clamped to 100 -> grade A
 */
export const mockReportClean: BuildingReport = {
  address: '310 East 70th Street, Manhattan, NY 10021',
  bbl: '1014050028',
  bin: '1042673',
  borough: 'Manhattan',
  lat: 40.76762,
  lng: -73.95849,
  unitCount: 48,
  yearBuilt: 1962,
  grade: 'A',
  score: 100,
  stats: {
    hpdComplaintsAllTime: 9,
    hpdComplaints24mo: 2,
    openViolations: 0,
    closedViolations: 12,
    classCViolations: 0,
    dobComplaints24mo: 0,
    complaintsPerUnitPerYear: 0.02,
    cityMedianPerUnitPerYear: 0.28,
  },
  categories: [
    {
      key: 'heat_hot_water',
      label: 'Heat & Hot Water',
      count24mo: 1,
      countAllTime: 3,
      openCount: 0,
      severity: 'low',
    },
    {
      key: 'plumbing',
      label: 'Plumbing & Leaks',
      count24mo: 1,
      countAllTime: 3,
      openCount: 0,
      severity: 'low',
    },
    {
      key: 'pests',
      label: 'Pests & Vermin',
      count24mo: 0,
      countAllTime: 1,
      openCount: 0,
      severity: 'low',
    },
    {
      key: 'electrical',
      label: 'Electrical',
      count24mo: 0,
      countAllTime: 1,
      openCount: 0,
      severity: 'low',
    },
    {
      key: 'structural',
      label: 'Structural & Surfaces',
      count24mo: 0,
      countAllTime: 0,
      openCount: 0,
      severity: 'low',
    },
    {
      key: 'elevator',
      label: 'Elevator',
      count24mo: 0,
      countAllTime: 1,
      openCount: 0,
      severity: 'low',
    },
    {
      key: 'safety',
      label: 'Fire & Safety',
      count24mo: 0,
      countAllTime: 0,
      openCount: 0,
      severity: 'low',
    },
    {
      key: 'other',
      label: 'Other',
      count24mo: 0,
      countAllTime: 0,
      openCount: 0,
      severity: 'low',
    },
  ],
  timeline: [
    {
      date: '2026-06-02',
      source: 'HPD_COMPLAINT',
      category: 'plumbing',
      status: 'closed',
      description: 'Slow bathroom drain, apartment 8F — resolved',
      className: null,
    },
    {
      date: '2026-01-15',
      source: 'HPD_COMPLAINT',
      category: 'heat_hot_water',
      status: 'closed',
      description: 'Radiator not heating in one bedroom, apartment 11B — resolved',
      className: null,
    },
    {
      date: '2025-09-24',
      source: 'HPD_VIOLATION',
      category: 'elevator',
      status: 'closed',
      description: 'Post elevator inspection certificate in cab — corrected',
      className: 'A',
    },
    {
      date: '2025-03-11',
      source: 'HPD_VIOLATION',
      category: 'plumbing',
      status: 'closed',
      description: 'Repair leaky shower valve, apartment 6C — corrected and certified',
      className: 'B',
    },
    {
      date: '2024-05-19',
      source: 'HPD_COMPLAINT',
      category: 'heat_hot_water',
      status: 'closed',
      description: 'Hot water temperature low in the morning — resolved',
      className: null,
    },
    {
      date: '2023-11-08',
      source: 'HPD_VIOLATION',
      category: 'electrical',
      status: 'closed',
      description: 'Replace cover plate at laundry room outlet — corrected',
      className: 'A',
    },
    {
      date: '2023-04-27',
      source: 'HPD_COMPLAINT',
      category: 'pests',
      status: 'closed',
      description: 'Mice reported in trash room — exterminator record filed',
      className: null,
    },
    {
      date: '2022-08-30',
      source: 'HPD_COMPLAINT',
      category: 'plumbing',
      status: 'closed',
      description: 'Leak at building water main, basement — repaired',
      className: null,
    },
  ],
  bedbug: { reported: false, infestedUnits: null, year: null },
  narrative: null,
  dataAsOf: '2026-08-14T18:00:00.000Z',
  dataQuality: { unitCountKnown: true, matchedBin: true, warnings: [] },
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
