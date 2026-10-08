'use client';

import Link from 'next/link';
import type { NavItem } from '@apteez/config';
import { UserRound } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage, Skeleton, cn } from '@apteez/ui';
import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/use-profile';
import { Logo } from './logo';
import { NavLink } from './nav-link';
import { PERSONAL_NAV, PRIMARY_NAV } from '@apteez/config';

function NavGroup({
  title,
  items,
  onNavigate,
  collapsed = false,
}: {
  title: string;
  items: readonly NavItem[];
  onNavigate?: () => void;
  collapsed?: boolean;
}): React.JSX.Element {
  return (
    <nav aria-label={title} className="space-y-1">
      {collapsed ? (
        <span className="mx-auto block h-px w-8 bg-gradient-to-r from-transparent via-primary/40 to-transparent" aria-hidden />
      ) : (
        <p className="px-3 pb-1.5 text-metadata uppercase tracking-widest text-subtle-foreground">
          {title}
        </p>
      )}
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.key}>
            <NavLink item={item} onNavigate={onNavigate} iconOnly={collapsed} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Sidebar account card. Bound to the auth query so it shows the signed-in
 * user (with their uploaded photo when available), a loading skeleton (no
 * layout jump) or the guest invitation. Collapses to a centered avatar.
 */
function SidebarAccount({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}): React.JSX.Element {
  const { user, isLoading } = useAuth();
  const { data: profile } = useProfile({ enabled: Boolean(user) });
  const avatarUrl = profile?.avatarUrl ?? null;

  const body = user ? (
    <>
      <Avatar className="size-9 shrink-0 border border-border">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt={user.displayName} /> : null}
        <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/60 text-sm font-bold text-primary">
          {user.displayName.trim().charAt(0).toUpperCase() || 'A'}
        </AvatarFallback>
      </Avatar>
      {collapsed ? null : (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">
            {user.displayName}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            @{user.username ?? 'solver'}
          </span>
        </span>
      )}
    </>
  ) : (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <UserRound className="size-4" aria-hidden />
      </span>
      {collapsed ? null : (
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">Guest</span>
          <span className="block truncate text-xs text-muted-foreground">
            Sign in to sync progress
          </span>
        </span>
      )}
    </>
  );

  return (
    <div className={cn('border-t border-border', collapsed ? 'p-2' : 'p-3')}>
      <Link
        href={user ? '/profile' : '/login'}
        onClick={onNavigate}
        title={collapsed ? (user ? user.displayName : 'Sign in') : undefined}
        aria-label={collapsed ? (user ? `Profile — ${user.displayName}` : 'Sign in') : undefined}
        className={cn(
          'flex items-center gap-3 rounded-xl p-2 transition-all duration-300 hover:bg-accent/60 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring',
          collapsed && 'justify-center',
        )}
      >
        {isLoading ? (
          collapsed ? (
            <Skeleton className="size-9 rounded-full" />
          ) : (
            <>
              <Skeleton className="size-9 rounded-full" />
              <span className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-16" />
              </span>
            </>
          )
        ) : (
          body
        )}
      </Link>
    </div>
  );
}

/** Shared sidebar content used by the desktop sidebar and mobile drawer. */
export function SidebarContent({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          'flex h-top-bar shrink-0 items-center border-b border-border',
          collapsed ? 'justify-center px-2' : 'px-5',
        )}
      >
        <Logo compact={collapsed} />
      </div>
      <div className={cn('flex-1 space-y-6 overflow-y-auto py-4', collapsed ? 'px-2' : 'px-3')}>
        <NavGroup title="Compete" items={PRIMARY_NAV} onNavigate={onNavigate} collapsed={collapsed} />
        <NavGroup title="Personal" items={PERSONAL_NAV} onNavigate={onNavigate} collapsed={collapsed} />
      </div>
      <SidebarAccount onNavigate={onNavigate} collapsed={collapsed} />
    </div>
  );
}

/**
 * Desktop sidebar. Collapses to an icon-only rail (labels + badges hide,
 * tooltips take over) when `collapsed` is set — the toggle lives in the
 * top bar. Tablet/mobile keep the drawer + tab bar instead.
 */
export function Sidebar({
  className,
  collapsed = false,
}: {
  className?: string;
  collapsed?: boolean;
}): React.JSX.Element {
  return (
    <aside
      className={cn(
        'shrink-0 border-r border-border/70 bg-elevated/70 backdrop-blur-xl transition-[width] duration-300',
        collapsed ? 'w-[4.75rem]' : 'w-sidebar',
        className,
      )}
    >
      <div className="sticky top-0 h-screen">
        <SidebarContent collapsed={collapsed} />
      </div>
    </aside>
  );
}
