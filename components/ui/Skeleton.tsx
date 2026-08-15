import { cn } from '@/components/ui/cn';

/** Neutral loading block. Always aria-hidden — the live region announces state instead. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-lg bg-slate-200', className)}
    />
  );
}
