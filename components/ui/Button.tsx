import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/components/ui/cn';

type Variant = 'primary' | 'secondary';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-blue-700 text-white hover:bg-blue-800 active:bg-blue-900',
  secondary:
    'bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 active:bg-slate-100',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

/** 44px minimum target — this gets tapped one-handed in a hallway. */
export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex min-h-[44px] items-center justify-center rounded-xl px-5 text-sm font-semibold',
        'transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        'focus-visible:outline-blue-700 disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
    />
  );
}
