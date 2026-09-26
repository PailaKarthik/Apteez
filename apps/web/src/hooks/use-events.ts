'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  EventDetailDto,
  EventLeaderboardEntryDto,
  EventResultDto,
  EventSessionDto,
  EventSubmitPreviewDto,
  EventSummaryDto,
  NotificationDto,
  OrganizationDto,
} from '@apteez/types';
import type { EventLeaderboardQuery, EventListQuery } from '@apteez/validation';
import { apiFetch } from '@/lib/api-client';

/** Discovery list; filters map straight to API params. */
export function eventsListPath(query: Partial<EventListQuery> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return `/events${qs ? `?${qs}` : ''}`;
}

export function useEvents(query: Partial<EventListQuery> = {}) {
  return useQuery({
    queryKey: ['events', 'list', query],
    queryFn: () =>
      apiFetch<{
        items: EventSummaryDto[];
        meta: { page: number; pageSize: number; total: number; totalPages: number };
      }>(eventsListPath(query)),
    staleTime: 10_000,
  });
}

export function useEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: ['events', 'detail', eventId],
    queryFn: () => apiFetch<EventDetailDto>(`/events/${eventId}`),
    enabled: Boolean(eventId),
    staleTime: 10_000,
  });
}

export function useEventSession(eventId: string | undefined) {
  return useQuery({
    queryKey: ['events', 'session', eventId],
    queryFn: () => apiFetch<EventSessionDto>(`/events/${eventId}/session`),
    enabled: Boolean(eventId),
    retry: 1,
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<EventDetailDto>('/events', { method: 'POST', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
    },
  });
}

export function useUpdateEvent(eventId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<EventDetailDto>(`/events/${eventId}`, { method: 'PATCH', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events', 'detail', eventId] });
      void queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
    },
  });
}

export function useTransitionEvent(eventId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (to: string) =>
      apiFetch<EventDetailDto>(`/events/${eventId}/transitions`, { method: 'POST', body: { to } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events', 'detail', eventId] });
      void queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
    },
  });
}

export function usePublishEvent(eventId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<EventDetailDto>(`/events/${eventId}/publish`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events', 'detail', eventId] });
      void queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
    },
  });
}

export function useRegisterEvent(eventId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: { code?: string }) =>
      apiFetch<{ registered: boolean; status: string }>(`/events/${eventId}/register`, {
        method: 'POST',
        body: body ?? {},
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events', 'detail', eventId] });
      void queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
    },
  });
}

export function useWithdrawEvent(eventId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ registered: boolean }>(`/events/${eventId}/register`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events', 'detail', eventId] });
      void queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
    },
  });
}

export function useJoinEvent(eventId: string | undefined) {
  return useMutation({
    mutationFn: (body?: { code?: string }) =>
      apiFetch<EventSessionDto>(`/events/${eventId}/join`, { method: 'POST', body: body ?? {} }),
  });
}

export function useAnswerEvent(eventId: string | undefined) {
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
        `/events/${eventId}/questions/${questionId}/answer`,
        { method: 'POST', body },
      ),
  });
}

export function useReviewEvent(eventId: string | undefined) {
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
        `/events/${eventId}/questions/${questionId}/review`,
        { method: 'POST', body },
      ),
  });
}

export function useSubmitPreviewEvent(eventId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['events', 'submit-preview', eventId],
    queryFn: () => apiFetch<EventSubmitPreviewDto>(`/events/${eventId}/submit-preview`),
    enabled: Boolean(eventId) && enabled,
  });
}

export function useSubmitEvent(eventId: string | undefined) {
  return useMutation({
    mutationFn: () => apiFetch<EventResultDto>(`/events/${eventId}/submit`, { method: 'POST' }),
  });
}

export function useEventResult(eventId: string | undefined) {
  return useQuery({
    queryKey: ['events', 'result', eventId],
    queryFn: () => apiFetch<EventResultDto>(`/events/${eventId}/results`),
    enabled: Boolean(eventId),
    retry: 1,
  });
}

export function useEventLeaderboard(
  eventId: string | undefined,
  query: Partial<EventLeaderboardQuery> = {},
) {
  return useQuery({
    queryKey: ['events', 'leaderboard', eventId, query],
    queryFn: () =>
      apiFetch<{
        items: EventLeaderboardEntryDto[];
        meta: { page: number; pageSize: number; total: number; totalPages: number };
      }>(`/events/${eventId}/leaderboard?page=${query.page ?? 1}&pageSize=${query.pageSize ?? 50}`),
    enabled: Boolean(eventId),
    staleTime: 10_000,
  });
}

export function useEventParticipants(eventId: string | undefined) {
  return useQuery({
    queryKey: ['events', 'participants', eventId],
    queryFn: () =>
      apiFetch<{ items: Array<Record<string, unknown>>; meta: Record<string, number> }>(
        `/events/${eventId}/participants`,
      ),
    enabled: Boolean(eventId),
  });
}

export function useInviteToEvent(eventId: string | undefined) {
  return useMutation({
    mutationFn: (body: { invitedUserId?: string; invitedEmail?: string }) =>
      apiFetch<{ id: string; status: string }>(`/events/${eventId}/invites`, {
        method: 'POST',
        body,
      }),
  });
}

export function useOrganizations(search?: string) {
  const q = (search ?? '').trim();
  return useQuery({
    queryKey: ['organizations', q],
    queryFn: () =>
      apiFetch<{ items: OrganizationDto[] }>(
        `/organizations${q ? `?q=${encodeURIComponent(q)}` : ''}`,
      ),
    staleTime: 60_000,
  });
}

/** Join a university/organization (unlocks its UNIVERSITY events). */
export function useJoinOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (organizationId: string) =>
      apiFetch<{ joined: boolean }>(`/organizations/${organizationId}/join`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['organizations'] });
      void queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

/** Self-serve: add a missing college to the directory, then select it. */
export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; slug: string }) =>
      apiFetch<{ id: string; slug: string }>('/organizations', { method: 'POST', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}

export function useNotifications(unreadOnly = false, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['notifications', unreadOnly],
    queryFn: () =>
      apiFetch<{ items: NotificationDto[]; meta: Record<string, number> }>(
        `/notifications?${unreadOnly ? 'unreadOnly=true&' : ''}page=1&pageSize=20`,
      ),
    enabled: opts?.enabled ?? true,
    staleTime: 15_000,
  });
}

export function useUnreadCount(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => apiFetch<{ unread: number }>('/notifications/unread-count'),
    enabled: opts?.enabled ?? true,
    staleTime: 15_000,
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ read: number }>('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
