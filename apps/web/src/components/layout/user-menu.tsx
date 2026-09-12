'use client';

import { Loader2, LogIn, LogOut, Target, UserRound } from 'lucide-react';
import Link from 'next/link';
import {
  Avatar,
  AvatarFallback,
  ComingSoonBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
} from '@apteez/ui';
import { useAuth, useLogout } from '@/hooks/use-auth';

/**
 * Profile dropdown bound to the auth query. Signed-in users see their real
 * data (avatar, name, email) plus Profile / Weekly Targets (coming soon) /
 * Sign out; guests see Sign in / Create account. Only real actions exist.
 */
export function UserMenu(): React.JSX.Element {
  const { user, isLoading } = useAuth();
  const { logout, isLoggingOut } = useLogout();

  // Skeleton with identical dimensions — no layout jump while loading.
  if (isLoading) {
    return <Skeleton className="size-8 rounded-full" aria-label="Loading profile" />;
  }

  const initial = user ? user.displayName.trim().charAt(0).toUpperCase() || 'A' : 'G';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={user ? `Account menu for ${user.displayName}` : 'Account menu'}
          className="rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Avatar className="size-8 border border-border">
            <AvatarFallback className="text-xs font-semibold">{initial}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {user ? (
          <>
            <DropdownMenuLabel>
              <span className="block truncate text-sm font-semibold">{user.displayName}</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {user.email}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <UserRound aria-hidden />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/targets">
                <Target aria-hidden />
                Weekly targets
                <ComingSoonBadge className="ml-auto" />
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => void logout()}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <LogOut aria-hidden />
              )}
              Sign out
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuLabel>
              <span className="block text-sm font-semibold">Guest</span>
              <span className="block text-xs font-normal text-muted-foreground">
                Sign in to sync progress
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/login">
                <LogIn aria-hidden />
                Sign in
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/register">
                <UserRound aria-hidden />
                Create account
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
