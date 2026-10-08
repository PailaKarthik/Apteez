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
        'fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-elevated/90 shadow-[0_-12px_40px_-18px_hsl(var(--primary)/0.4)] backdrop-blur-xl supports-[backdrop-filter]:bg-elevated/80',
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
                  'relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[11px] font-medium transition-all duration-300 active:scale-95',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                <span className="relative flex size-7 items-center justify-center">
                  <Icon
                    className={cn('size-5 transition-transform duration-300', active && 'scale-110')}
                    aria-hidden
                  />
                  <span
                    aria-hidden
                    className={cn(
                      'absolute -bottom-1.5 h-1 w-4 rounded-full bg-gradient-to-r from-primary to-accent-foreground transition-all duration-300',
                      active ? 'opacity-100 scale-100' : 'opacity-0 scale-50',
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
