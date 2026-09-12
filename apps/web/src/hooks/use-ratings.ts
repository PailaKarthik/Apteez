'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  CursorPage,
  RatingHistoryEntryDto,
  RatingLeaderboardEntryDto,
  RatingsOverviewDto,
} from '@apteez/types';
import { apiFetch } from '@/lib/api-client';

export interface RatingHistoryParams {
  domain?: string;
  result?: 'WIN' | 'LOSS' | 'DRAW';
  limit?: number;
}

/** The caller's competitive ratings, per domain. */
export function useMyRatings(domain?: string) {
  return useQuery({
    queryKey: ['ratings', 'me', domain ?? 'all'],
    queryFn: () =>
      apiFetch<RatingsOverviewDto>(
        `/ratings/me${domain ? `?domain=${encodeURIComponent(domain)}` : ''}`,
      ),
    staleTime: 15_000,
  });
}

/** Another user's public competitive ratings, by username. */
export function useUserRatings(username: string | undefined) {
  return useQuery({
    queryKey: ['ratings', 'user', username],
    queryFn: () => apiFetch<RatingsOverviewDto>(`/ratings/users/${username}`),
    enabled: Boolean(username),
    staleTime: 30_000,
  });
}

/** Paginated, filterable rating history for the caller. */
export function useRatingHistory(params: RatingHistoryParams = {}) {
  const { domain, result, limit = 20 } = params;
  const search = new URLSearchParams();
  if (domain) {
    search.set('domain', domain);
  }
  if (result) {
    search.set('result', result);
  }
  search.set('limit', String(limit));
  const query = search.toString();
  return useQuery({
    queryKey: ['ratings', 'history', query],
    queryFn: () => apiFetch<CursorPage<RatingHistoryEntryDto>>(`/ratings/history?${query}`),
    staleTime: 15_000,
  });
}

/** Domain leaderboard, optionally narrowed to one institution. */
export function useRatingLeaderboard(domain: string, institution?: string) {
  const search = new URLSearchParams({ domain });
  if (institution) {
    search.set('institution', institution);
  }
  return useQuery({
    queryKey: ['ratings', 'leaderboard', domain, institution ?? 'global'],
    queryFn: () =>
      apiFetch<RatingLeaderboardEntryDto[]>(`/ratings/leaderboard?${search.toString()}`),
    enabled: Boolean(domain),
    staleTime: 30_000,
  });
}
