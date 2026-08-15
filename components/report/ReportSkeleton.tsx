import { Skeleton } from '@/components/ui/Skeleton';

/** Mirrors the real page's rhythm so nothing jumps when the data lands. */
export function ReportSkeleton() {
  return (
    <div role="status" aria-label="Loading building report" className="pb-16">
      <div className="px-5 pb-2 pt-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-4 h-32 w-full rounded-2xl" />
        <Skeleton className="mt-5 h-6 w-3/4" />
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>

      <div className="px-5 py-8">
        <Skeleton className="h-5 w-40" />
        <div className="mt-5 grid grid-cols-2 gap-3">
          {[0, 1, 2, 3, 4, 5].map((key) => (
            <Skeleton key={key} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
        <Skeleton className="mt-4 h-40 w-full rounded-2xl" />
      </div>

      <div className="px-5 py-8">
        <Skeleton className="h-5 w-48" />
        <div className="mt-5 space-y-3">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      </div>

      <span className="sr-only">Loading building report</span>
    </div>
  );
}
