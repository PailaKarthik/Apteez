'use client';

import { healthResponseSchema } from '@apteez/validation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';

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
