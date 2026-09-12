'use client';

import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { LoadingState } from '@apteez/ui';
import { useAuth } from '@/hooks/use-auth';

/**
 * Client-side gate for authenticated areas. While auth state loads, a
 * full-page spinner avoids content flashes; signed-out visitors are sent
 * to /login with a safe `next` return path. Backend guards remain the real
 * enforcement — this is UX only.
 */
export function RequireAuth({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (!isLoading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, user, router, pathname]);

  if (isLoading) {
    return <LoadingState title="Checking your session…" />;
  }
  if (!user) {
    return <LoadingState title="Redirecting to sign in…" />;
  }
  return <>{children}</>;
}
