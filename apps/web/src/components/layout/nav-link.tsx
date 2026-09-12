'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavItem } from '@apteez/config';
import { ComingSoonBadge, cn } from '@apteez/ui';
import { NAV_ICONS } from './nav-icons';

function isActive(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Sidebar navigation control: consistent height, aligned icons, an active
 * indicator bar, hover/focus states, and a subdued treatment for
 * coming-soon entries (present in the IA — clearly not yet functional).
 */
export function NavLink({
  item,
  onNavigate,
}: {
  item: NavItem;
  onNavigate?: () => void;
}): React.JSX.Element {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const Icon = NAV_ICONS[item.icon];
  const comingSoon = item.badge === 'soon';

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors duration-fast',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
        comingSoon && !active && 'text-subtle-foreground',
      )}
    >
      {/* Active indicator bar */}
      <span
        aria-hidden
        className={cn(
          'absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary transition-opacity duration-fast',
          active ? 'opacity-100' : 'opacity-0',
        )}
      />
      <Icon
        className={cn(
          'size-4 shrink-0 transition-colors duration-fast',
          active
            ? 'text-primary'
            : comingSoon
              ? 'text-subtle-foreground/70 group-hover:text-muted-foreground'
              : 'text-muted-foreground group-hover:text-foreground',
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {comingSoon ? <ComingSoonBadge className="shrink-0" /> : null}
    </Link>
  );
}
