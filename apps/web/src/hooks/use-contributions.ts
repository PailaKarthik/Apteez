'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContributionDetailDto, ContributionMinePageDto } from '@apteez/types';
import type { ContributionQuestionInput } from '@apteez/validation';
import { apiFetch } from '@/lib/api-client';
import { invalidateActivityQueries } from '@/lib/invalidate-activity';

/** Submit a new question for human review (lands PENDING, reviewers paged). */
export function useSubmitContribution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ContributionQuestionInput) =>
      apiFetch<{ id: string; status: string }>('/contributions', {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contributions', 'mine'] });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      invalidateActivityQueries(queryClient);
    },
  });
}

/** Revise your own PENDING contribution (e.g. after reviewer feedback). */
export function useResubmitContribution(id: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ContributionQuestionInput) =>
      apiFetch<{ id: string; status: string }>(`/contributions/${id}`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contributions', 'mine'] });
      void queryClient.invalidateQueries({ queryKey: ['contributions', 'detail', id] });
    },
  });
}

export function useMyContributions(page = 1, pageSize = 10) {
  return useQuery({
    queryKey: ['contributions', 'mine', page, pageSize],
    queryFn: () =>
      apiFetch<ContributionMinePageDto>(`/contributions/mine?page=${page}&pageSize=${pageSize}`),
    staleTime: 15_000,
  });
}

export function useContributionDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['contributions', 'detail', id],
    queryFn: () => apiFetch<ContributionDetailDto>(`/contributions/${id}`),
    enabled: Boolean(id),
    retry: 1,
    staleTime: 15_000,
  });
}
