'use client';

import { Loader2, LogIn, LogOut, Target, UserRound } from 'lucide-react';
import Link from 'next/link';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
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
import { useProfile } from '@/hooks/use-profile';

/**
 * Profile dropdown bound to the auth query. Signed-in users see their real
 * data (avatar, name, email) plus Profile / Weekly Targets (coming soon) /
 * Sign out; guests see Sign in / Create account. Only real actions exist.
 */
export function UserMenu(): React.JSX.Element {
  const { user, isLoading } = useAuth();
  const { logout, isLoggingOut } = useLogout();
  // Profile photo for the top-right avatar; disabled for guests so no
  // request fires until someone is actually signed in.
  const { data: profile } = useProfile({ enabled: Boolean(user) });
  const avatarUrl = profile?.avatarUrl ?? null;

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
          className="group rounded-full transition-all duration-300 hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Avatar className="size-8 border border-border transition-all duration-300 group-hover:border-primary/60 group-hover:shadow-lg group-hover:shadow-primary/25">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={user?.displayName ?? 'Profile photo'} /> : null}
            <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/60 text-xs font-bold text-primary">
              {initial}
            </AvatarFallback>
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
