'use client';

import { Toaster } from '@apteez/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import * as React from 'react';
import { ApiError } from '@/lib/api-client';
import { useKeepWarm } from '@/hooks/use-health';

/** Retry only failures worth retrying: network blips and 5xx responses. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) {
    return false;
  }
  if (error instanceof ApiError) {
    return error.kind === 'network' || error.kind === 'server';
  }
  return true;
}

export function Providers({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Warm-path bias: with a far-away pooler (~1.5s per round trip),
            // refetching on every mount/navigation is the main source of
            // perceived lag. 60s stale keeps back-nav and tab-switch instant;
            // per-hook staleTimes extend this further for slow-moving data.
            staleTime: 60_000,
            gcTime: 10 * 60_000,
            refetchOnWindowFocus: false,
            refetchOnReconnect: 'always',
            retry: shouldRetry,
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <KeepWarm />
        {children}
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

/** Invisible keep-warm ticker: keeps Neon/pool hot so sections open fast. */
function KeepWarm(): React.JSX.Element | null {
  useKeepWarm();
  return null;
}
