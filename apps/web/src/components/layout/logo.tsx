import Link from 'next/link';
import { BRAND } from '@apteez/config';
import { cn } from '@apteez/ui';

export function Logo({ className }: { className?: string }): React.JSX.Element {
  return (
    <Link href="/" className={cn('flex items-center gap-2.5', className)} aria-label={BRAND.name}>
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-violet-800 text-lg font-extrabold text-white shadow-sm"
      >
        A
      </span>
      <span className="text-lg font-bold tracking-tight text-foreground">{BRAND.name}</span>
    </Link>
  );
}
