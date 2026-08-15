/**
 * Tappable demo buildings for the landing page. Judges will click these, so every
 * BBL here must be a real one we can actually render.
 *
 * These two are the BBLs backing the committed fixtures in /lib. Adding a third is
 * a one-line change — drop in `{ label, sublabel, href: '/building/<real bbl>' }`
 * once we have another verified address. Do not invent a BBL to fill the slot;
 * a fabricated city identifier on the demo strip undermines the whole premise.
 *
 * The `?mock=clean` flag is the API's documented dev affordance for the grade-A
 * fixture. It no-ops once the real BBL lookup lands, so the link stays correct.
 */
export interface DemoAddress {
  label: string;
  sublabel: string;
  href: string;
}

export const DEMO_ADDRESSES: DemoAddress[] = [
  {
    label: '1520 Sheridan Avenue',
    sublabel: 'Bronx, NY 10457',
    href: '/building/2028130037',
  },
  {
    label: '310 East 70th Street',
    sublabel: 'Manhattan, NY 10021',
    href: '/building/1014050028?mock=clean',
  },
];
