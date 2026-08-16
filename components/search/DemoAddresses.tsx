import Link from 'next/link';
import { DEMO_ADDRESSES } from '@/components/search/demoData';
import { BuildingIcon } from '@/components/ui/icons';

/** Zero-typing entry points. Deliberately below the input, deliberately obvious. */
export function DemoAddresses() {
  return (
    <div className="mt-4">
      {/* No visible heading in the design, but the list still needs a name in the a11y tree. */}
      <h2 className="sr-only">Try a real building</h2>
      <ul className="space-y-3">
        {DEMO_ADDRESSES.map((demo) => (
          <li key={demo.href}>
            <Link
              href={demo.href}
              className="flex min-h-[64px] items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-inset ring-slate-200 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              <BuildingIcon className="h-5 w-5 shrink-0 text-blue-600" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-slate-900">
                  {demo.label}
                </span>
                <span className="block truncate text-[13px] text-slate-500">{demo.sublabel}</span>
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
