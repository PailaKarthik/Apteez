'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ContestDetailDto,
  ContestDraftDto,
  ContestLeaderboardEntryDto,
  ContestManageDto,
  ContestResultDto,
  ContestSessionDto,
  ContestSubmitPreviewDto,
  ContestSummaryDto,
  ContestUpsolveDto,
  PaginatedData,
} from '@apteez/types';
import type {
  ContestCreateInput,
  ContestListQuery,
  OrganizerContestPatchInput,
} from '@apteez/validation';
import { apiFetch } from '@/lib/api-client';
import { invalidateActivityQueries } from '@/lib/invalidate-activity';

/** Discovery list; filters map straight to API params. */
export function contestsListPath(query: Partial<ContestListQuery> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }
    const text = String(value);
    if (text === '') {
      continue;
    }
    params.set(key, text);
  }
  const qs = params.toString();
  return `/contests${qs ? `?${qs}` : ''}`;
}

export function useContests(query: Partial<ContestListQuery> = {}) {
  return useQuery({
    queryKey: ['contests', 'list', query],
    queryFn: () => apiFetch<PaginatedData<ContestSummaryDto>>(contestsListPath(query)),
    staleTime: 10_000,
    placeholderData: keepPreviousData,
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

export function useContestLeaderboard(
  contestId: string | undefined,
  enabled = true,
  opts: { page?: number; pageSize?: number; live?: boolean } = {},
) {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 50;
  return useQuery({
    queryKey: ['contests', 'leaderboard', contestId, page, pageSize],
    queryFn: () =>
      apiFetch<PaginatedData<ContestLeaderboardEntryDto>>(
        `/contests/${contestId}/leaderboard?page=${page}&pageSize=${pageSize}`,
      ),
    enabled: Boolean(contestId) && enabled,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
    refetchInterval: opts.live ? 10_000 : false,
  });
}

export function useContestResult(contestId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['contests', 'result', contestId],
    queryFn: () => apiFetch<ContestResultDto>(`/contests/${contestId}/result`),
    enabled: Boolean(contestId) && enabled,
    retry: 1,
    staleTime: 10_000,
  });
}

export function useContestUpsolve(contestId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['contests', 'upsolve', contestId],
    queryFn: () => apiFetch<ContestUpsolveDto>(`/contests/${contestId}/upsolve`),
    enabled: Boolean(contestId) && enabled,
    retry: 1,
    staleTime: 30_000,
  });
}

export function useContestSession(contestId: string | undefined, live = false) {
  return useQuery({
    queryKey: ['contests', 'session', contestId],
    queryFn: () => apiFetch<ContestSessionDto>(`/contests/${contestId}/session`),
    enabled: Boolean(contestId),
    retry: 1,
    // Live polling keeps the server clock (and auto-submit) honest while idle.
    refetchInterval: live ? 5_000 : false,
  });
}

export function useContestSubmitPreview(contestId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['contests', 'submit-preview', contestId],
    queryFn: () => apiFetch<ContestSubmitPreviewDto>(`/contests/${contestId}/submit-preview`),
    enabled: Boolean(contestId) && enabled,
    retry: 1,
  });
}

function invalidateContest(
  queryClient: ReturnType<typeof useQueryClient>,
  contestId?: string,
): void {
  void queryClient.invalidateQueries({ queryKey: ['contests', 'list'] });
  if (contestId) {
    void queryClient.invalidateQueries({ queryKey: ['contests', 'detail', contestId] });
    void queryClient.invalidateQueries({ queryKey: ['contests', 'session', contestId] });
    void queryClient.invalidateQueries({ queryKey: ['contests', 'result', contestId] });
    void queryClient.invalidateQueries({ queryKey: ['contests', 'leaderboard', contestId] });
  }
}

export function useRegisterContest(contestId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ registered: boolean; status: string }>(`/contests/${contestId}/register`, {
        method: 'POST',
      }),
    onSuccess: () => invalidateContest(queryClient, contestId),
  });
}

export function useUnregisterContest(contestId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ registered: boolean }>(`/contests/${contestId}/register`, { method: 'DELETE' }),
    onSuccess: () => invalidateContest(queryClient, contestId),
  });
}

export function useStartContest(contestId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<ContestSessionDto>(`/contests/${contestId}/start`, { method: 'POST' }),
    onSuccess: () => invalidateContest(queryClient, contestId),
  });
}

export function useAnswerContestQuestion(contestId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      questionId: string;
      selectedOptionId: string;
      currentPosition?: number;
    }) =>
      apiFetch<{ saved: boolean; answeredCount: number; reviewCount: number }>(
        `/contests/${contestId}/questions/${body.questionId}/answer`,
        {
          method: 'POST',
          body: { selectedOptionId: body.selectedOptionId, currentPosition: body.currentPosition },
        },
      ),
    // Instant feedback: paint the selection locally the moment the user
    // taps. The server write + session refetch below only confirm it, so an
    // answer feels instant even when the round trip takes a second. The
    // navigator/counts reconcile from the server response right after.
    onMutate: (body) => {
      void queryClient.setQueryData<ContestSessionDto>(
        ['contests', 'session', contestId],
        (old) => {
          if (!old || old.current.questionId !== body.questionId) {
            return old;
          }
          if (old.current.selectedOptionId) {
            return { ...old, current: { ...old.current, selectedOptionId: body.selectedOptionId } };
          }
          return {
            ...old,
            current: { ...old.current, selectedOptionId: body.selectedOptionId },
            answeredCount: old.answeredCount + 1,
            unansweredCount: Math.max(0, old.unansweredCount - 1),
          };
        },
      );
    },
    // Roll back to the server truth on any failure (the error toast fires
    // at the call site).
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: ['contests', 'session', contestId] });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contests', 'session', contestId] });
    },
  });
}

export function useToggleContestReview(contestId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      questionId: string;
      markedForReview: boolean;
      currentPosition?: number;
    }) =>
      apiFetch<{ saved: boolean; answeredCount: number; reviewCount: number }>(
        `/contests/${contestId}/questions/${body.questionId}/review`,
        {
          method: 'POST',
          body: { markedForReview: body.markedForReview, currentPosition: body.currentPosition },
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contests', 'session', contestId] });
    },
  });
}

export function useSubmitContest(contestId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<ContestResultDto>(`/contests/${contestId}/submit`, { method: 'POST' }),
    onSuccess: () => {
      invalidateContest(queryClient, contestId);
      invalidateActivityQueries(queryClient);
      // A submission eventually produces rating history (processed at
      // close): refresh the profile graph so the new curve appears without
      // a manual reload.
      void queryClient.invalidateQueries({ queryKey: ['profile', 'rating-history'] });
    },
  });
}

/**
 * Integrity telemetry (fullscreen exits, tab hides, copy/paste). Fire-and-
 * forget by design: reporting must never block answering, and the server
 * throttles it. Stored off the result path.
 */
export function useReportContestEvent(contestId: string | undefined) {
  return useMutation({
    mutationFn: (body: { type: string; detail?: string }) =>
      apiFetch<{ recorded: boolean }>(`/contests/${contestId}/events`, {
        method: 'POST',
        body,
      }),
    retry: false,
  });
}

// ─── Organizer management ───────────────────────────────────────────────────

function invalidateManage(
  queryClient: ReturnType<typeof useQueryClient>,
  contestId?: string,
): void {
  void queryClient.invalidateQueries({ queryKey: ['contests', 'manage', contestId] });
  void queryClient.invalidateQueries({ queryKey: ['contests', 'list'] });
  void queryClient.invalidateQueries({ queryKey: ['contests', 'drafts'] });
  if (contestId) {
    void queryClient.invalidateQueries({ queryKey: ['contests', 'detail', contestId] });
  }
}

/** Step 1: create the DRAFT format (question count + length first). */
export function useCreateContest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ContestCreateInput) =>
      apiFetch<ContestManageDto>('/contests', { method: 'POST', body }),
    onSuccess: (data) => invalidateManage(queryClient, data.id),
  });
}

/** Resume list: unfinished DRAFT setups the caller may manage. */
export function useContestDrafts(enabled = true) {
  return useQuery({
    queryKey: ['contests', 'drafts'],
    queryFn: () => apiFetch<ContestDraftDto[]>('/contests/drafts'),
    enabled,
    retry: 1,
    staleTime: 10_000,
  });
}

export function useContestManage(contestId: string | undefined) {
  return useQuery({
    queryKey: ['contests', 'manage', contestId],
    queryFn: () => apiFetch<ContestManageDto>(`/contests/${contestId}/manage`),
    enabled: Boolean(contestId),
    retry: 1,
    staleTime: 10_000,
  });
}

export function useUpdateContestDraft(contestId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: OrganizerContestPatchInput) =>
      apiFetch<ContestManageDto>(`/contests/${contestId}`, { method: 'PATCH', body }),
    onSuccess: (data) => invalidateManage(queryClient, data.id),
  });
}

/** Step 2: attach one published problem (positions append in order). */
export function useAddContestQuestion(contestId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { problemId: string }) =>
      apiFetch<ContestManageDto>(`/contests/${contestId}/questions`, {
        method: 'POST',
        body,
      }),
    onSuccess: (data) => invalidateManage(queryClient, data.id),
  });
}

export function useRemoveContestQuestion(contestId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (questionId: string) =>
      apiFetch<ContestManageDto>(`/contests/${contestId}/questions/${questionId}`, {
        method: 'DELETE',
      }),
    onSuccess: (data) => invalidateManage(queryClient, data.id),
  });
}

/** Manual repair for stuck ratings (ENDED contests, organizer/admin). */
export function useRetryContestRatings(contestId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ranked: number; ratingsApplied: boolean; ratingStatus: string }>(
        `/contests/${contestId}/ratings/retry`,
        { method: 'POST' },
      ),
    onSuccess: (data) => {
      invalidateManage(queryClient, contestId);
      void queryClient.invalidateQueries({ queryKey: ['contests', 'result', contestId] });
      void queryClient.invalidateQueries({ queryKey: ['contests', 'leaderboard', contestId] });
      // A successful retry writes contestRatingHistory rows: refresh the
      // profile graph so the curve appears without a manual reload.
      void queryClient.invalidateQueries({ queryKey: ['profile', 'rating-history'] });
      return data;
    },
  });
}

export function usePublishContest(contestId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<ContestManageDto>(`/contests/${contestId}/publish`, { method: 'POST' }),
    onSuccess: (data) => invalidateManage(queryClient, data.id),
  });
}
