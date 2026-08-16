import { AddressSearch } from '@/components/search/AddressSearch';
import { DemoAddresses } from '@/components/search/DemoAddresses';
import { BrandMark } from '@/components/ui/icons';

export default function Page() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-lg bg-slate-50 px-5 pb-16 pt-10">
      <div className="flex items-center gap-3">
        <BrandMark className="h-11 w-11 shrink-0 text-blue-600" />
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-none tracking-tight text-slate-900">
            Walkthrough
          </p>
          <p className="mt-1.5 text-xs font-bold uppercase tracking-[0.12em] text-blue-600">
            NYC Building Insights
          </p>
        </div>
      </div>

      <h1 className="mt-8 text-3xl font-semibold leading-tight tracking-tight text-slate-900">
        Know the building before you sign.
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        Every complaint and violation NYC has on record for an address, in one page. Built from
        public city data.
      </p>

      <div className="mt-7">
        <AddressSearch />
      </div>

      <DemoAddresses />

      <p className="mt-10 border-t border-slate-200 pt-6 text-center text-xs leading-relaxed text-slate-500">
        Walkthrough uses public NYC Open Data records. It reflects complaints and violations
        that have been reported to the city.
      </p>
    </main>
  );
}
