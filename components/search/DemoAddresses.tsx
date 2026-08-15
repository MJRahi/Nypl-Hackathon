import Link from 'next/link';
import { DEMO_ADDRESSES } from '@/components/search/demoData';

/** Zero-typing entry points. Deliberately below the input, deliberately obvious. */
export function DemoAddresses() {
  return (
    <div className="mt-8">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Or try a real building
      </h2>
      <ul className="mt-3 space-y-2">
        {DEMO_ADDRESSES.map((demo) => (
          <li key={demo.href}>
            <Link
              href={demo.href}
              className="flex min-h-[56px] items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-inset ring-slate-200 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900">
                  {demo.label}
                </span>
                <span className="block truncate text-xs text-slate-500">{demo.sublabel}</span>
              </span>
              <span aria-hidden="true" className="shrink-0 text-slate-400">
                &rarr;
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
