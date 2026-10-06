'use client';

import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import type { AuthUser } from '@apteez/types';
import { ApiError, apiFetch } from '@/lib/api-client';

export const AUTH_ME_QUERY_KEY = ['auth', 'me'] as const;

async function fetchMe(): Promise<AuthUser | null> {
  try {
    return await apiFetch<AuthUser>('/auth/me');
  } catch (error) {
    // Unauthenticated is an expected state, not a failure.
    if (error instanceof ApiError && error.kind === 'unauthorized') {
      return null;
    }
    throw error;
  }
}

/**
 * Single source of auth truth. TanStack Query owns the user object — no
 * duplicated local copies. `user === null` means signed out.
 */
export function useAuth(): UseQueryResult<AuthUser | null, Error> & {
  user: AuthUser | null;
  isAuthenticated: boolean;
} {
  // Long stale window on purpose: this query mounts in the topbar of EVERY
  // page, and /auth/me costs multiple far-region round trips cold. The
  // server remains authoritative per request (guards re-resolve the session),
  // so a 2-minute client window only delays UI chrome updates, never access.
  const query = useQuery({
    queryKey: AUTH_ME_QUERY_KEY,
    queryFn: fetchMe,
    staleTime: 120_000,
    gcTime: 10 * 60_000,
  });
  const user = query.data ?? null;
  return { ...query, user, isAuthenticated: user !== null };
}

export interface AuthMutationInput {
  next?: string | null;
}

/** Only relative in-app paths may follow login/register (open-redirect guard). */
export function sanitizeNextPath(next: string | null | undefined): string {
  if (
    typeof next === 'string' &&
    next.startsWith('/') &&
    !next.startsWith('//') &&
    !next.includes('\\') &&
    !next.includes(':')
  ) {
    return next;
  }
  return '/';
}

/** Translate API auth errors into safe, actionable UI messages. */
export function authErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    switch (error.kind) {
      case 'validation':
        return 'Check the highlighted fields and try again.';
      case 'unauthorized':
        return error.message || 'Incorrect email or password.';
      case 'forbidden':
        return error.message || 'This account cannot sign in right now.';
      case 'conflict':
        return error.message || 'An account with these details already exists.';
      case 'rate_limit':
        return 'Too many attempts. Wait a bit and try again.';
      case 'network':
        return 'Unable to reach the server. Check your connection.';
      default:
        return error.message || fallback;
    }
  }
  return fallback;
}

export function useLogout(): { logout: () => Promise<void>; isLoggingOut: boolean } {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  const logout = React.useCallback(async () => {
    setIsLoggingOut(true);
    try {
      // Idempotent server-side: never fails the UI, even when expired.
      await apiFetch<{ loggedOut: boolean }>('/auth/logout', { method: 'POST' }).catch(() => null);
    } finally {
      // Drop every cached (potentially user-scoped) query, then land home.
      queryClient.clear();
      setIsLoggingOut(false);
      router.push('/');
      router.refresh();
    }
  }, [queryClient, router]);

  return { logout, isLoggingOut };
}
