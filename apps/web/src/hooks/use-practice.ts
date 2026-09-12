'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AttemptDto,
  AttemptResultDto,
  CursorPage,
  ProblemDetailDto,
  ProblemUserStatsDto,
  RecentSubmissionDto,
} from '@apteez/types';
import { apiFetch } from '@/lib/api-client';

/** Start (or resume) a practice attempt. Created when the user engages. */
export function useStartAttempt(problemId: string | undefined) {
  return useMutation({
    mutationFn: () => apiFetch<AttemptDto>(`/problems/${problemId}/attempts`, { method: 'POST' }),
  });
}

export interface SubmitAttemptVariables {
  attemptId: string;
  selectedOptionId: string;
  clientTimeSpentSeconds?: number;
}

export function useSubmitAttempt(problemId: string | undefined) {
  return useMutation({
    mutationFn: ({ attemptId, ...body }: SubmitAttemptVariables) =>
      apiFetch<AttemptResultDto>(`/problems/${problemId}/attempts/${attemptId}/submit`, {
        method: 'POST',
        body,
      }),
  });
}

export function useProblemStats(problemId: string | undefined) {
  return useQuery({
    queryKey: ['problems', 'stats', problemId],
    queryFn: () => apiFetch<ProblemUserStatsDto | null>(`/problems/${problemId}/stats`),
    enabled: Boolean(problemId),
    staleTime: 10_000,
  });
}

export function useNextProblem(problemId: string | undefined) {
  return useQuery({
    queryKey: ['problems', 'next', problemId],
    queryFn: () => apiFetch<{ id: string }>(`/problems/${problemId}/next`),
    enabled: Boolean(problemId),
    staleTime: 60_000,
    retry: false,
  });
}

export function useRecentPractice(limit = 20) {
  return useQuery({
    queryKey: ['submissions', 'recent', limit],
    queryFn: () => apiFetch<CursorPage<RecentSubmissionDto>>(`/submissions/recent?limit=${limit}`),
    staleTime: 15_000,
  });
}

/**
 * After a submission the practice result already carries the authoritative
 * problem detail, so the cache is updated in place and only the affected
 * list/stats queries are invalidated.
 */
export function usePracticeCacheSync(): {
  syncAfterSubmit: (result: AttemptResultDto) => void;
} {
  const queryClient = useQueryClient();
  const syncAfterSubmit = (result: AttemptResultDto): void => {
    queryClient.setQueryData<ProblemDetailDto>(
      ['problems', 'detail', result.problem.id],
      result.problem,
    );
    void queryClient.invalidateQueries({ queryKey: ['problems', 'stats', result.problem.id] });
    void queryClient.invalidateQueries({ queryKey: ['problems', 'feed'] });
    void queryClient.invalidateQueries({ queryKey: ['submissions', 'recent'] });
  };
  return { syncAfterSubmit };
}
