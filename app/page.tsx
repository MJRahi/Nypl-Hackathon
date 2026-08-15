import { AddressSearch } from '@/components/search/AddressSearch';
import { DemoAddresses } from '@/components/search/DemoAddresses';

export default function Page() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-lg bg-slate-50 px-5 pb-16 pt-12">
      <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">LeaseLens NYC</p>
      <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-slate-900">
        Know the building before you sign.
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        Every complaint and violation NYC has on record for an address, in one page. Built from
        public city data.
      </p>

      <div className="mt-8">
        <AddressSearch />
      </div>

      <DemoAddresses />

      <p className="mt-10 border-t border-slate-200 pt-6 text-xs leading-relaxed text-slate-500">
        LeaseLens reads public NYC Open Data records. It reflects complaints and violations that
        were filed &mdash; not everything that happens in a building. It is not legal advice.
      </p>
    </main>
  );
}
