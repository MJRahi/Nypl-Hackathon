import { ReportView } from '@/components/report/ReportView';

interface BuildingPageProps {
  params: { bbl: string };
}

export default function BuildingPage({ params }: BuildingPageProps) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-lg bg-slate-50">
      <ReportView bbl={params.bbl} />
    </main>
  );
}
