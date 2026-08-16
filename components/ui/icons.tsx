/**
 * Inline SVG icons. Kept local rather than pulling an icon package — four glyphs
 * is not worth a dependency, and these need to ship in the first paint.
 *
 * All of them inherit `currentColor`, so colour is decided by the caller.
 */

/** Tower with a magnifier punched into it. The halo matches the page ground. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
      {/* tower, shifted right so the magnifier only clips its lower-left corner */}
      <rect x="16" y="3.5" width="20" height="33" rx="2.5" fill="currentColor" />
      <g fill="#F8FAFC">
        <rect x="20" y="8.5" width="4.5" height="4.5" rx="1" />
        <rect x="27.5" y="8.5" width="4.5" height="4.5" rx="1" />
        <rect x="20" y="15.5" width="4.5" height="4.5" rx="1" />
        <rect x="27.5" y="15.5" width="4.5" height="4.5" rx="1" />
        <rect x="27.5" y="22.5" width="4.5" height="4.5" rx="1" />
        <rect x="27.5" y="29.5" width="4.5" height="4.5" rx="1" />
      </g>
      {/* halo matches the page ground, so the lens reads as cut out of the tower */}
      <circle cx="13.5" cy="27.5" r="10.2" fill="#F8FAFC" />
      <circle cx="13.5" cy="27.5" r="6.6" stroke="currentColor" strokeWidth="3" />
      <path
        d="m18.3 32.3 4.4 4.4"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PinIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M10 17.5s5.8-5 5.8-9.1a5.8 5.8 0 1 0-11.6 0c0 4.1 5.8 9.1 5.8 9.1Z" />
      <circle cx="10" cy="8.2" r="2.2" />
    </svg>
  );
}

export function InfoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="7.6" />
      <path d="M10 9.2v4.6" strokeLinecap="round" />
      <circle cx="10" cy="6.5" r="0.95" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 17V5.4A1.4 1.4 0 0 1 5.4 4h6.2A1.4 1.4 0 0 1 13 5.4V17" />
      <path d="M13 9.2h2.6A1.4 1.4 0 0 1 17 10.6V17" />
      <path d="M2.6 17h14.8" />
      <path d="M6.6 7.4h1.2M10.2 7.4h1.2M6.6 10.4h1.2M10.2 10.4h1.2M6.6 13.4h1.2M10.2 13.4h1.2" />
    </svg>
  );
}
