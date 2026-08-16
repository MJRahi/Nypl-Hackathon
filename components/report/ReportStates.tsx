import Link from 'next/link';
import { Button } from '@/components/ui/Button';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 pb-16 pt-10">
      <Link
        href="/"
        className="inline-flex min-h-[36px] items-center text-sm font-medium text-blue-700 hover:text-blue-800"
      >
        &larr; New search
      </Link>
      <div className="mt-6">{children}</div>
    </div>
  );
}

/**
 * NOT_FOUND is good news here, not an error: the city has nothing on this building.
 * It gets the same celebratory treatment as a grade-A record.
 */
export function NoRecordsState({ bbl }: { bbl: string }) {
  return (
    <Shell>
      <div className="rounded-2xl bg-emerald-50 px-5 py-6 ring-1 ring-inset ring-emerald-200">
        <p className="text-4xl leading-none" aria-hidden="true">
          ✓
        </p>
        <h1 className="mt-4 text-xl font-semibold leading-snug tracking-tight text-emerald-900">
          No complaints or violations on record for this building.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-emerald-900/80">
          NYC has nothing filed against BBL <span className="tabular-nums">{bbl}</span>. That is the
          best result this search can return.
        </p>
      </div>

      <p className="mt-6 text-xs leading-relaxed text-slate-500">
        A clean record means nothing was <em>filed</em>. Many problems never get reported, so still
        see the apartment and ask questions before you sign.
      </p>

      <Link href="/" className="mt-6 block">
        <Button variant="secondary" className="w-full">
          Search another address
        </Button>
      </Link>
    </Shell>
  );
}

interface RetryStateProps {
  title: string;
  message: string;
  /**
   * Omitted when retrying cannot possibly help — a malformed BBL fails the same
   * way every time, so offering the button just wastes a tap on someone who is
   * already stuck.
   */
  onRetry?: () => void;
}

export function RetryState({ title, message, onRetry }: RetryStateProps) {
  return (
    <Shell>
      <div className="rounded-2xl bg-white px-5 py-6 ring-1 ring-inset ring-slate-200">
        <h1 className="text-xl font-semibold leading-snug tracking-tight text-slate-900">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{message}</p>
        {onRetry ? (
          <Button onClick={onRetry} className="mt-5 w-full">
            Try again
          </Button>
        ) : null}
      </div>

      <Link href="/" className="mt-4 block">
        <Button variant="secondary" className="w-full">
          Search a different address
        </Button>
      </Link>
    </Shell>
  );
}
