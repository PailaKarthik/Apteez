'use client';

import { healthResponseSchema } from '@apteez/validation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';

/**
 * Keep-warm ping: every 60s the app touches /health so the free-tier Neon
 * compute never suspends and the pool stays warm. Without this, the first
 * visit after a few idle minutes pays a 10–30s cold wake (or times out into
 * the error wall). Cheap (~a few Upstash/Neon ops per minute), no UI.
 */
export function useKeepWarm() {
  return useQuery({
    queryKey: ['health', 'keepwarm'],
    queryFn: async () => {
      const data = await apiFetch<unknown>('/health');
      return healthResponseSchema.parse(data);
    },
    refetchInterval: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
}

/** Live API health, polled for the status surfaces (home + shell). */
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const data = await apiFetch<unknown>('/health');
      return healthResponseSchema.parse(data);
    },
    refetchInterval: 30_000,
    retry: false,
  });
}
