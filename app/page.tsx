import { AddressSearch } from '@/components/search/AddressSearch';
import { DemoAddresses } from '@/components/search/DemoAddresses';
import { BrandMark } from '@/components/ui/icons';

export default function Page() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* The reading column stays narrow for legibility; only the demo cards use
          the extra width, so their addresses don't truncate. */}
      <main className="mx-auto w-full max-w-lg px-5 pb-16 pt-10 md:max-w-2xl md:px-8 md:pt-16 lg:max-w-4xl">
        <div className="flex items-center gap-3">
          <BrandMark className="h-11 w-11 shrink-0 text-blue-600 md:h-12 md:w-12" />
          <div className="min-w-0">
            <p className="text-2xl font-bold leading-none tracking-tight text-slate-900">
              Walkthrough
            </p>
            <p className="mt-1.5 text-xs font-bold uppercase tracking-[0.12em] text-blue-600">
              NYC Building Insights
            </p>
          </div>
        </div>

        <h1 className="mt-8 max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-slate-900 md:mt-12 md:text-[2.75rem]">
          Know the building before you sign.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 md:mt-4 md:max-w-xl md:text-base">
          Every complaint and violation NYC has on record for an address, in one page. Built from
          public city data.
        </p>

        {/* A full-width search bar on a wide screen looks like a mistake. */}
        <div className="mt-7 max-w-2xl md:mt-9">
          <AddressSearch />
        </div>

        <DemoAddresses />

        <p className="mt-10 border-t border-slate-200 pt-6 text-center text-xs leading-relaxed text-slate-500 md:mt-14">
          Walkthrough uses public NYC Open Data records. It reflects complaints and violations
          that have been reported to the city.
        </p>
      </main>
    </div>
  );
}
