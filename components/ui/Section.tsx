import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';

interface SectionProps {
  title: string;
  /** Short line under the heading. Use it to explain what the reader is looking at. */
  caption?: string;
  children: ReactNode;
  className?: string;
}

/**
 * One band of the report. Generous vertical rhythm is deliberate — this page is
 * read on a phone, standing up, under time pressure.
 */
export function Section({ title, caption, children, className }: SectionProps) {
  return (
    <section className={cn('px-5 py-8', className)}>
      <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
      {caption ? <p className="mt-1 text-sm leading-relaxed text-slate-500">{caption}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}
