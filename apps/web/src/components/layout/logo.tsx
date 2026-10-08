import Image from 'next/image';
import Link from 'next/link';
import { BRAND } from '@apteez/config';
import { cn } from '@apteez/ui';

/**
 * Brand lockup: logo mark + wordmark. The mark is `/logo.svg` (currently a
 * dummy placeholder) so swapping in the final logo is a file overwrite —
 * no component changes, everywhere included.
 */
export function Logo({
  className,
  compact = false,
}: {
  className?: string;
  /** Collapsed-rail mode: mark only, no wordmark. */
  compact?: boolean;
}): React.JSX.Element {
  return (
    <Link
      href="/"
      className={cn('flex items-center gap-2.5', compact && 'justify-center', className)}
      aria-label={BRAND.name}
      title={compact ? BRAND.name : undefined}
    >
      <Image
        src="/logo.svg"
        alt=""
        width={32}
        height={32}
        priority
        className="size-8 rounded-lg shadow-sm transition-transform duration-300 hover:rotate-6 hover:scale-105"
      />
      {compact ? null : (
        <span className="text-lg font-bold tracking-tight text-foreground">{BRAND.name}</span>
      )}
    </Link>
  );
}
