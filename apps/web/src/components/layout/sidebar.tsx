'use client';

import Link from 'next/link';
import type { NavItem } from '@apteez/config';
import { UserRound } from 'lucide-react';
import { Avatar, AvatarFallback, Skeleton, cn } from '@apteez/ui';
import { useAuth } from '@/hooks/use-auth';
import { Logo } from './logo';
import { NavLink } from './nav-link';
import { PERSONAL_NAV, PRIMARY_NAV } from '@apteez/config';

function NavGroup({
  title,
  items,
  onNavigate,
}: {
  title: string;
  items: readonly NavItem[];
  onNavigate?: () => void;
}): React.JSX.Element {
  return (
    <nav aria-label={title} className="space-y-1">
      <p className="px-3 pb-1.5 text-metadata uppercase tracking-widest text-subtle-foreground">
        {title}
      </p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.key}>
            <NavLink item={item} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Sidebar account card. Bound to the auth query so it shows the signed-in
 * user, a loading skeleton (no layout jump) or the guest invitation.
 */
function SidebarAccount({ onNavigate }: { onNavigate?: () => void }): React.JSX.Element {
  const { user, isLoading } = useAuth();

  const body = user ? (
    <>
      <Avatar className="size-9">
        <AvatarFallback className="text-sm font-semibold">
          {user.displayName.trim().charAt(0).toUpperCase() || 'A'}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">
          {user.displayName}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          @{user.username ?? 'solver'}
        </span>
      </span>
    </>
  ) : (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <UserRound className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">Guest</span>
        <span className="block truncate text-xs text-muted-foreground">
          Sign in to sync progress
        </span>
      </span>
    </>
  );

  return (
    <div className="border-t border-border p-3">
      <Link
        href={user ? '/profile' : '/login'}
        onClick={onNavigate}
        className="flex items-center gap-3 rounded-xl p-2 transition-colors duration-fast hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
      >
        {isLoading ? (
          <>
            <Skeleton className="size-9 rounded-full" />
            <span className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-16" />
            </span>
          </>
        ) : (
          body
        )}
      </Link>
    </div>
  );
}

/** Shared sidebar content used by the desktop sidebar and mobile drawer. */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }): React.JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-top-bar shrink-0 items-center border-b border-border px-5">
        <Logo />
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        <NavGroup title="Compete" items={PRIMARY_NAV} onNavigate={onNavigate} />
        <NavGroup title="Personal" items={PERSONAL_NAV} onNavigate={onNavigate} />
      </div>
      <SidebarAccount onNavigate={onNavigate} />
    </div>
  );
}

/**
 * Desktop/tablet sidebar. Tablet (md) shows a compact icon-rail version
 * driven by the same navigation config; lg+ gets the full labeled sidebar.
 */
export function Sidebar({ className }: { className?: string }): React.JSX.Element {
  return (
    <aside className={cn('w-sidebar shrink-0 border-r border-border bg-elevated/60', className)}>
      <div className="sticky top-0 h-screen">
        <SidebarContent />
      </div>
    </aside>
  );
}
