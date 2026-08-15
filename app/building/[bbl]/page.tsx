import { ReportView } from '@/components/report/ReportView';

interface BuildingPageProps {
  params: { bbl: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

export default function BuildingPage({ params, searchParams }: BuildingPageProps) {
  const mock = typeof searchParams.mock === 'string' ? searchParams.mock : null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg bg-slate-50">
      <ReportView bbl={params.bbl} mock={mock} />
    </main>
  );
}
