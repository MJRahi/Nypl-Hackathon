/**
 * Tappable demo buildings for the landing page. Judges will click these, so every
 * BBL here must be one the real pipeline can actually resolve.
 *
 * Each BBL below was resolved through /api/geocode and then confirmed against
 * /api/building on the live pipeline, and each label is the address the report
 * itself renders — so the button text and the report header always agree.
 *
 * Deliberately spans the grade scale and three boroughs: F, C, A. Do not swap a
 * BBL in here without re-checking it end to end; an unresolvable BBL renders the
 * "no records" state, which reads as good news and silently ruins the demo.
 */
export interface DemoAddress {
  label: string;
  sublabel: string;
  href: string;
}

export const DEMO_ADDRESSES: DemoAddress[] = [
  {
    label: '1510 Sheridan Avenue',
    sublabel: 'Bronx, NY 10457',
    href: '/building/2028190005',
  },
  {
    label: '627 Manhattan Avenue',
    sublabel: 'Brooklyn, NY 11222',
    href: '/building/3026460001',
  },
  {
    label: '310 East 70 Street',
    sublabel: 'Manhattan, NY 10021',
    href: '/building/1014440043',
  },
];
