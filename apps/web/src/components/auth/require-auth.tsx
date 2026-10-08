'use client';

import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';

function SessionShimmer({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="animate-fade-in space-y-3" aria-busy="true" aria-label={label}>
      <div className="loading-rail h-1" aria-hidden>
        <span />
      </div>
      <div className="overflow-hidden rounded-2xl border border-border">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-border p-3 last:border-0"
            aria-hidden
          >
            <div className="skeleton-shine size-9 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton-shine h-4 w-2/5 rounded-md" />
              <div className="skeleton-shine h-3 w-3/5 rounded-md" />
            </div>
            <div className="skeleton-shine h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Client-side gate for authenticated areas. While auth state loads, a
 * layout-mirroring shimmer avoids content flashes; signed-out visitors are
 * sent to /login with a safe `next` return path. Backend guards remain the
 * real enforcement — this is UX only.
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
    return <SessionShimmer label="Checking your session" />;
  }
  if (!user) {
    return <SessionShimmer label="Redirecting to sign in" />;
  }
  return <>{children}</>;
}
