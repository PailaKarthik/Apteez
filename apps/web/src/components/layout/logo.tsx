import Image from 'next/image';
import Link from 'next/link';
import { BRAND } from '@apteez/config';
import { cn } from '@apteez/ui';

/**
 * Brand lockup: logo mark + wordmark. The mark is `/logo.svg` (currently a
 * dummy placeholder) so swapping in the final logo is a file overwrite —
 * no component changes, everywhere included.
 */
export function Logo({ className }: { className?: string }): React.JSX.Element {
  return (
    <Link href="/" className={cn('flex items-center gap-2.5', className)} aria-label={BRAND.name}>
      <Image
        src="/logo.svg"
        alt=""
        width={32}
        height={32}
        priority
        className="size-8 rounded-lg shadow-sm"
      />
      <span className="text-lg font-bold tracking-tight text-foreground">{BRAND.name}</span>
    </Link>
  );
}
