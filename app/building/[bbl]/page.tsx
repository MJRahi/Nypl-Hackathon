import { ReportView } from '@/components/report/ReportView';

interface BuildingPageProps {
  params: { bbl: string };
}

export default function BuildingPage({ params }: BuildingPageProps) {
  return (
    // Full-bleed background with a centred column, so widening the content on a
    // desktop doesn't leave the page sitting on a white slab.
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto w-full max-w-lg md:max-w-3xl lg:max-w-6xl">
        <ReportView bbl={params.bbl} />
      </main>
    </div>
  );
}
