'use client';

import { usePathname } from 'next/navigation';
import { PERSONAL_NAV, PRIMARY_NAV } from '@apteez/config';
import { cn } from '@apteez/ui';

/**
 * Section context for the top bar. Reads the active section from the route
 * (single source: the shared navigation config) so the label always matches
 * both the sidebar and the mobile tab bar.
 */
export function Breadcrumb(): React.JSX.Element {
  const pathname = usePathname();
  const match = [...PRIMARY_NAV, ...PERSONAL_NAV].find((item) =>
    item.href === '/'
      ? pathname === '/'
      : pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  return (
    <p
      className={cn(
        // min-w-0 lets the flex parent shrink this instead of shoving the
        // topbar icon group off-screen on narrow phones.
        'min-w-0 flex-1 truncate text-sm font-semibold text-foreground',
        'sm:text-base sm:tracking-tight',
      )}
      aria-live="polite"
    >
      {match?.label ?? 'ApteeZ'}
    </p>
  );
}
