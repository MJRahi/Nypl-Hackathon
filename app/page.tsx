/**
 * PLACEHOLDER — this file belongs to lane B. Overwrite it completely.
 * It exists only so `npm run dev` serves something at / instead of a 404.
 */
export default function Page() {
  return (
    <main className="mx-auto max-w-2xl p-10">
      <h1 className="text-2xl font-semibold">LeaseLens NYC</h1>
      <p className="mt-2 text-slate-600">
        Scaffold is up. <code className="rounded bg-slate-100 px-1">GET /api/building</code> returns
        the mock report.
      </p>
    </main>
  );
}
