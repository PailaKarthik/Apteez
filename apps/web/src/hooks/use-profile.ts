'use client';

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AchievementDto,
  ActivityDayDto,
  DifficultyPerformanceDto,
  DomainPerformanceDto,
  NextFocusDto,
  PerformanceOverallDto,
  ProfileDto,
  PublicProfileDto,
  RatingPointDto,
  RecentActivityItemDto,
  StreakDto,
  TopicPerformanceDto,
  WeakAreaDto,
} from '@apteez/types';
import { apiFetch } from '@/lib/api-client';

export function useProfile(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['profile', 'me'],
    queryFn: () => apiFetch<ProfileDto>('/profile/me'),
    staleTime: 30_000,
    enabled: options?.enabled ?? true,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<ProfileDto>('/profile/me', { method: 'PATCH', body }),
    onSuccess: (profile) => {
      queryClient.setQueryData(['profile', 'me'], profile);
      void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}

export function useAvatarUpload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.set('avatar', file);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'}/profile/me/avatar`,
        { method: 'POST', body: form, credentials: 'include' },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          success?: boolean;
          error?: { message?: string };
        } | null;
        throw new Error(payload?.error?.message ?? 'Avatar upload failed.');
      }
      const payload = (await response.json()) as {
        success: boolean;
        data: { avatarKey: string; avatarUrl: string };
      };
      return payload.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
      void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}

export function useProfileOverview() {
  return useQuery({
    queryKey: ['profile', 'overview'],
    queryFn: () =>
      apiFetch<{
        profile: ProfileDto;
        overall: PerformanceOverallDto;
        streak: StreakDto;
        points: {
          total: number;
          earned: number;
          recent: Array<{ id: string; amount: number; reason: string; createdAt: string }>;
        };
        ratings: {
          challenge: Array<{
            domainSlug: string;
            domainName: string;
            rating: number;
            tier: string;
          }>;
          contest: { rating: number } | null;
        };
        achievementsUnlocked: number;
        newUnlocks: string[];
      }>('/profile/me/overview'),
    staleTime: 15_000,
  });
}

export function usePerformance() {
  return useQuery({
    queryKey: ['profile', 'performance'],
    queryFn: () => apiFetch<PerformanceOverallDto>('/profile/me/performance'),
    staleTime: 15_000,
  });
}

export function useDomainPerformance() {
  return useQuery({
    queryKey: ['profile', 'domains'],
    queryFn: () => apiFetch<{ items: DomainPerformanceDto[] }>('/profile/me/performance/domains'),
    staleTime: 30_000,
  });
}

export function useTopicPerformance() {
  return useQuery({
    queryKey: ['profile', 'topics'],
    queryFn: () => apiFetch<{ items: TopicPerformanceDto[] }>('/profile/me/performance/topics'),
    staleTime: 30_000,
  });
}

export function useDifficultyPerformance() {
  return useQuery({
    queryKey: ['profile', 'difficulties'],
    queryFn: () =>
      apiFetch<{ items: DifficultyPerformanceDto[] }>('/profile/me/performance/difficulties'),
    staleTime: 30_000,
  });
}

export function useWeakAreas() {
  return useQuery({
    queryKey: ['profile', 'weak-areas'],
    queryFn: () => apiFetch<{ items: WeakAreaDto[] }>('/profile/me/performance/weak-areas'),
    staleTime: 30_000,
  });
}

export function useRatingHistory() {
  return useQuery({
    queryKey: ['profile', 'rating-history'],
    queryFn: () => apiFetch<{ items: RatingPointDto[] }>('/profile/me/rating-history?limit=100'),
    staleTime: 30_000,
  });
}

export function useActivityHeatmap(days = 182) {
  return useQuery({
    queryKey: ['profile', 'heatmap', days],
    queryFn: () => apiFetch<{ items: ActivityDayDto[] }>(`/profile/me/activity?days=${days}`),
    staleTime: 60_000,
  });
}

const RECENT_PAGE_SIZE = 15;

interface RecentActivityPage {
  items: RecentActivityItemDto[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Offset-paginated recent activity as an accumulating infinite feed:
 * page N covers offset (N-1)*pageSize, and loaded pages append instead of
 * replacing (the old "Show more" swapped the list out from under the user).
 */
export function useRecentActivity() {
  const query = useInfiniteQuery({
    queryKey: ['profile', 'recent'],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      apiFetch<RecentActivityPage>(
        `/profile/me/activity/recent?page=${pageParam}&pageSize=${RECENT_PAGE_SIZE}`,
      ),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
  return {
    ...query,
    items: query.data?.pages.flatMap((page) => page.items) ?? [],
  };
}

export function useStreak(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['profile', 'streak'],
    queryFn: () => apiFetch<StreakDto>('/profile/me/streak'),
    enabled: opts?.enabled ?? true,
    staleTime: 30_000,
  });
}

export function useAchievements() {
  return useQuery({
    queryKey: ['profile', 'achievements'],
    queryFn: () =>
      apiFetch<{ items: AchievementDto[]; newlyUnlocked: string[] }>('/profile/me/achievements'),
    staleTime: 30_000,
  });
}

export function useProfileContributions() {
  return useQuery({
    queryKey: ['profile', 'contributions'],
    queryFn: () =>
      apiFetch<{
        counts: Record<string, number>;
        recent: Array<{ id: string; title: string; status: string; submittedAt: string }>;
      }>('/profile/me/contributions'),
    staleTime: 30_000,
  });
}

export function useProfileEvents() {
  return useQuery({
    queryKey: ['profile', 'events'],
    queryFn: () =>
      apiFetch<{
        events: Array<{
          id: string;
          title: string;
          status: string;
          rank: number | null;
          score: number;
        }>;
        contests: Array<{
          id: string;
          title: string;
          status: string;
          rank: number | null;
          score: number;
        }>;
        challenges: Array<{
          id: string;
          domain: string;
          result: string;
          change: number;
          createdAt: string;
        }>;
      }>('/profile/me/events'),
    staleTime: 30_000,
  });
}

export function usePointsSummary() {
  return useQuery({
    queryKey: ['profile', 'points'],
    queryFn: () =>
      apiFetch<{
        total: number;
        earned: number;
        recent: Array<{ id: string; amount: number; reason: string; createdAt: string }>;
      }>('/profile/me/points'),
    staleTime: 30_000,
  });
}

export function useNextFocus(enabled = true) {
  return useQuery({
    queryKey: ['profile', 'next-focus'],
    queryFn: () => apiFetch<NextFocusDto>('/profile/me/next-focus'),
    staleTime: 60_000,
    enabled,
    retry: false,
  });
}

export function usePublicProfile(username: string | undefined) {
  return useQuery({
    queryKey: ['users', username],
    queryFn: () => apiFetch<PublicProfileDto>(`/users/${username}`),
    enabled: Boolean(username),
    staleTime: 30_000,
    retry: false,
  });
}
