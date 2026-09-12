'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DiscussionReactionResultDto,
  DiscussionReactionType,
  DiscussionReplyDto,
  DiscussionThreadDetailDto,
  DiscussionThreadSummaryDto,
  PaginatedData,
} from '@apteez/types';
import type {
  DiscussionCreateReplyInput,
  DiscussionCreateThreadInput,
  DiscussionListQuery,
  DiscussionReportInput,
  DiscussionUpdateThreadInput,
} from '@apteez/validation';
import { apiFetch } from '@/lib/api-client';

function toSearchParams(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

export function useDiscussions(query: Partial<DiscussionListQuery> = {}) {
  return useQuery({
    queryKey: ['discussions', query],
    queryFn: () =>
      apiFetch<PaginatedData<DiscussionThreadSummaryDto>>(
        `/discussions${toSearchParams(query)}`,
      ),
    staleTime: 15_000,
  });
}

export function useDiscussion(id: string | undefined) {
  return useQuery({
    queryKey: ['discussions', 'thread', id],
    queryFn: () => apiFetch<DiscussionThreadDetailDto>(`/discussions/${id}`),
    enabled: Boolean(id),
    staleTime: 10_000,
  });
}

/** Invalidate the list + the one thread a mutation touches. */
function useDiscussionCache(id?: string): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['discussions'] });
    if (id) {
      void queryClient.invalidateQueries({ queryKey: ['discussions', 'thread', id] });
    }
  };
}

export function useCreateThread() {
  const sync = useDiscussionCache();
  return useMutation({
    mutationFn: (input: DiscussionCreateThreadInput) =>
      apiFetch<DiscussionThreadDetailDto>('/discussions', { method: 'POST', body: input }),
    onSuccess: sync,
  });
}

export function useUpdateThread(id: string) {
  const sync = useDiscussionCache(id);
  return useMutation({
    mutationFn: (input: DiscussionUpdateThreadInput) =>
      apiFetch<DiscussionThreadDetailDto>(`/discussions/${id}`, { method: 'PATCH', body: input }),
    onSuccess: sync,
  });
}

export function useDeleteThread(id: string) {
  const sync = useDiscussionCache(id);
  return useMutation({
    mutationFn: () => apiFetch<{ deleted: boolean }>(`/discussions/${id}`, { method: 'DELETE' }),
    onSuccess: sync,
  });
}

export function useCreateReply(id: string) {
  const sync = useDiscussionCache(id);
  return useMutation({
    mutationFn: (input: DiscussionCreateReplyInput) =>
      apiFetch<DiscussionReplyDto>(`/discussions/${id}/replies`, { method: 'POST', body: input }),
    onSuccess: sync,
  });
}

export function useDeleteReply(id: string) {
  const sync = useDiscussionCache(id);
  return useMutation({
    mutationFn: (replyId: string) =>
      apiFetch<{ deleted: boolean }>(`/discussions/${id}/replies/${replyId}`, {
        method: 'DELETE',
      }),
    onSuccess: sync,
  });
}

export function useAcceptReply(id: string) {
  const sync = useDiscussionCache(id);
  return useMutation({
    mutationFn: (replyId: string) =>
      apiFetch<DiscussionReplyDto>(`/discussions/${id}/replies/${replyId}/accept`, {
        method: 'POST',
      }),
    onSuccess: sync,
  });
}

export interface ReactToPostAction {
  postId: string;
  type: DiscussionReactionType | null;
}

export function useReactToPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, type }: ReactToPostAction) =>
      type === null
        ? apiFetch<DiscussionReactionResultDto>(`/discussions/${postId}/reactions`, {
            method: 'DELETE',
          })
        : apiFetch<DiscussionReactionResultDto>(`/discussions/${postId}/reactions`, {
            method: 'POST',
            body: { type },
          }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['discussions'] });
    },
  });
}

export interface ReactToReplyAction {
  postId: string;
  replyId: string;
  type: DiscussionReactionType;
}

export function useReactToReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, replyId, type }: ReactToReplyAction) =>
      apiFetch<DiscussionReactionResultDto>(`/discussions/${postId}/replies/${replyId}/reactions`, {
        method: 'POST',
        body: { type },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['discussions'] });
    },
  });
}

export interface ReportAction {
  postId?: string;
  replyId?: string;
  input: DiscussionReportInput;
}

export function useReportDiscussion() {
  return useMutation({
    mutationFn: ({ postId, replyId, input }: ReportAction) => {
      const path =
        replyId && postId
          ? `/discussions/${postId}/replies/${replyId}/report`
          : `/discussions/${postId}/report`;
      return apiFetch<{ reported: boolean }>(path, { method: 'POST', body: input });
    },
  });
}