'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ContestDetailDto,
  ContestLeaderboardEntryDto,
  ContestResultDto,
  ContestSessionDto,
  ContestSubmitPreviewDto,
  ContestSummaryDto,
  ContestUpsolveDto,
} from '@apteez/types';
import type { ContestLeaderboardQuery, ContestListQuery } from '@apteez/validation';
import { ApiError, apiFetch } from '@/lib/api-client';

/** Discovery list; phase/difficulty filters map straight to API params. */
export function contestsListPath(query: Partial<ContestListQuery> = {}): string {
  const params = new URLSearchParams();
  if (query.phase) {
    params.set('phase', query.phase);
  }
  if (query.difficulty) {
    params.set('difficulty', query.difficulty);
  }
  if (query.page) {
    params.set('page', String(query.page));
  }
  if (query.pageSize) {
    params.set('pageSize', String(query.pageSize));
  }
  const qs = params.toString();
  return `/contests${qs ? `?${qs}` : ''}`;
}

export function useContests(query: Partial<ContestListQuery> = {}) {
  return useQuery({
    queryKey: ['contests', 'list', query],
    queryFn: () =>
      apiFetch<{
        items: ContestSummaryDto[];
        meta: { page: number; pageSize: number; total: number; totalPages: number };
      }>(contestsListPath(query)),
    staleTime: 10_000,
  });
}

export function useContest(contestId: string | undefined) {
  return useQuery({
    queryKey: ['contests', 'detail', contestId],
    queryFn: () => apiFetch<ContestDetailDto>(`/contests/${contestId}`),
    enabled: Boolean(contestId),
    staleTime: 10_000,
  });
}

export function useContestSession(contestId: string | undefined) {
  return useQuery({
    queryKey: ['contests', 'session', contestId],
    queryFn: () => apiFetch<ContestSessionDto>(`/contests/${contestId}/session`),
    enabled: Boolean(contestId),
    // Recovery is the point of this endpoint: refetch on reconnect.
    retry: 1,
  });
}

/** Enter the contest. Idempotent: re-entering restores the same session. */
export function useStart(contestId: string | undefined) {
  return useMutation({
    mutationFn: () =>
      apiFetch<ContestSessionDto>(`/contests/${contestId}/start`, { method: 'POST' }),
  });
}

export function useRegister(contestId: string | undefined) {
  return useMutation({
    mutationFn: () =>
      apiFetch<{ registered: boolean; status: string }>(`/contests/${contestId}/register`, {
        method: 'POST',
      }),
  });
}

export function useUnregister(contestId: string | undefined) {
  return useMutation({
    mutationFn: () =>
      apiFetch<{ registered: boolean }>(`/contests/${contestId}/register`, { method: 'DELETE' }),
  });
}

export function useAnswer(contestId: string | undefined) {
  return useMutation({
    mutationFn: ({
      questionId,
      ...body
    }: {
      questionId: string;
      selectedOptionId: string;
      currentPosition?: number;
    }) =>
      apiFetch<{ answeredCount: number; reviewCount: number }>(
        `/contests/${contestId}/questions/${questionId}/answer`,
        { method: 'POST', body },
      ),
  });
}

export function useReview(contestId: string | undefined) {
  return useMutation({
    mutationFn: ({
      questionId,
      ...body
    }: {
      questionId: string;
      markedForReview: boolean;
      currentPosition?: number;
    }) =>
      apiFetch<{ answeredCount: number; reviewCount: number }>(
        `/contests/${contestId}/questions/${questionId}/review`,
        { method: 'POST', body },
      ),
  });
}

export function useSubmitPreview(contestId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['contests', 'submit-preview', contestId],
    queryFn: () => apiFetch<ContestSubmitPreviewDto>(`/contests/${contestId}/submit-preview`),
    enabled: Boolean(contestId) && enabled,
  });
}

export function useSubmitContest(contestId: string | undefined) {
  return useMutation({
    mutationFn: () =>
      apiFetch<ContestResultDto>(`/contests/${contestId}/submit`, { method: 'POST' }),
  });
}

export function useContestResult(contestId: string | undefined) {
  return useQuery({
    queryKey: ['contests', 'result', contestId],
    queryFn: () => apiFetch<ContestResultDto>(`/contests/${contestId}/result`),
    enabled: Boolean(contestId),
    // Finalization may lag a timer expiry slightly; poll briefly.
    refetchInterval: (query) => (query.state.error ? false : 5_000),
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 404 && failureCount < 4,
  });
}

export function useContestLeaderboard(
  contestId: string | undefined,
  query: Partial<ContestLeaderboardQuery> = {},
) {
  return useQuery({
    queryKey: ['contests', 'leaderboard', contestId, query],
    queryFn: () =>
      apiFetch<{
        items: ContestLeaderboardEntryDto[];
        meta: { page: number; pageSize: number; total: number; totalPages: number };
      }>(
        `/contests/${contestId}/leaderboard?page=${query.page ?? 1}&pageSize=${query.pageSize ?? 50}`,
      ),
    enabled: Boolean(contestId),
    staleTime: 10_000,
  });
}

export function useUpsolve(contestId: string | undefined) {
  return useQuery({
    queryKey: ['contests', 'upsolve', contestId],
    queryFn: () => apiFetch<ContestUpsolveDto>(`/contests/${contestId}/upsolve`),
    enabled: Boolean(contestId),
  });
}

/** Best-effort integrity signals (tab hidden, blur, copy…); never blocks UI. */
export function useReportContestEvent(contestId: string | undefined) {
  return useMutation({
    mutationFn: (body: { type: string; detail?: string }) =>
      apiFetch<{ recorded: boolean }>(`/contests/${contestId}/events`, { method: 'POST', body }),
    // A failed signal report must never disturb the contest flow.
    onError: () => undefined,
  });
}

/**
 * Central cache maintenance for the contest flow. Registration changes both
 * the list cards and the detail page, so both families are invalidated.
 */
export function useContestCacheSync(contestId: string | undefined): {
  syncRegistered: (detail: ContestDetailDto) => void;
  syncFinalized: () => void;
  syncUnregistered: () => void;
} {
  const queryClient = useQueryClient();
  const syncRegistered = (detail: ContestDetailDto): void => {
    queryClient.setQueryData(['contests', 'detail', contestId], detail);
    void queryClient.invalidateQueries({ queryKey: ['contests', 'list'] });
  };
  const syncFinalized = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['contests', 'detail', contestId] });
    void queryClient.invalidateQueries({ queryKey: ['contests', 'session', contestId] });
    void queryClient.invalidateQueries({ queryKey: ['contests', 'result', contestId] });
    void queryClient.invalidateQueries({ queryKey: ['contests', 'leaderboard', contestId] });
  };
  const syncUnregistered = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['contests', 'detail', contestId] });
    void queryClient.invalidateQueries({ queryKey: ['contests', 'list'] });
  };
  return { syncRegistered, syncFinalized, syncUnregistered };
}
