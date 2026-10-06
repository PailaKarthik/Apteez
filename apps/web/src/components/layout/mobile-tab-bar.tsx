'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PRIMARY_NAV } from '@apteez/config';
import { cn } from '@apteez/ui';
import { NAV_ICONS } from './nav-icons';

function isActive(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Fixed bottom navigation for mobile: the seven primary competitive
 * sections as touch-friendly tabs. Personal areas (Targets, Contribute)
 * stay reachable through the drawer and profile menu.
 */
export function MobileTabBar({ className }: { className?: string }): React.JSX.Element {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 border-t border-border bg-elevated/95 backdrop-blur supports-[backdrop-filter]:bg-elevated/85',
        className,
      )}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-1 pb-[env(safe-area-inset-bottom)]">
        {PRIMARY_NAV.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = NAV_ICONS[item.icon];
          return (
            <li key={item.key} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-medium transition-colors duration-fast',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="relative flex size-7 items-center justify-center">
                  <Icon className="size-5" aria-hidden />
                  <span
                    aria-hidden
                    className={cn(
                      'absolute -bottom-1.5 h-1 w-1 rounded-full bg-primary transition-opacity duration-fast',
                      active ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                </span>
                <span className="truncate">
                  {/* Icon-only below 400px: seven labels never fit a 360px
                      viewport, and truncated stubs ("Lead…", "Disc…") help
                      nobody. Icons + active dot carry the meaning. */}
                  <span className="hidden min-[400px]:inline">{item.label}</span>
                  <span className="sr-only min-[400px]:hidden">{item.label}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
