'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminContestDto,
  AdminOverviewDto,
  AdminProblemDto,
  AdminUserDetailDto,
  AdminUserDto,
  AuditLogDto,
  ContestParticipantAdminDto,
  ContributionAdminDto,
  DiscussionReportAdminDto,
  ReportDto,
} from '@apteez/types';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from './use-auth';

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Permission-aware helper: usability only, the backend enforces everything. */
export function useAdminAccess(required: string[]): { allowed: boolean; isLoading: boolean } {
  const { user, isLoading } = useAuth();
  if (isLoading || !user) {
    return { allowed: false, isLoading };
  }
  const permissions = user.permissions ?? [];
  if (permissions.includes('manage:platform')) {
    return { allowed: true, isLoading: false };
  }
  return {
    allowed: required.some((permission) => permissions.includes(permission)),
    isLoading: false,
  };
}

const STAFF_PERMISSIONS = [
  'manage:users',
  'manage:questions',
  'review:contributions',
  'moderate:discussions',
  'manage:contests',
  'manage:events',
  'manage:rewards',
  'view:analytics',
  'manage:platform',
];

/**
 * Pure staff check mirroring app/admin/layout.tsx: the admin role or any
 * staff permission. Used for post-login routing — the backend re-checks
 * every admin request regardless.
 */
export function isStaffUser(
  user: {
    roles?: string[] | null;
    permissions?: string[] | null;
  } | null,
): boolean {
  if (!user) {
    return false;
  }
  const roles = user.roles ?? [];
  const permissions = user.permissions ?? [];
  if (roles.includes('admin') || permissions.includes('manage:platform')) {
    return true;
  }
  return permissions.some((permission) => STAFF_PERMISSIONS.includes(permission));
}

export function useAdminOverview(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => apiFetch<AdminOverviewDto>('/admin/overview'),
    enabled,
    staleTime: 60_000,
  });
}

export interface AdminUserFilters {
  q?: string;
  status?: string;
  role?: string;
  institution?: string;
  page?: number;
}

export function useAdminUsers(filters: AdminUserFilters, enabled: boolean) {
  const params = new URLSearchParams();
  if (filters.q) {
    params.set('q', filters.q);
  }
  if (filters.status) {
    params.set('status', filters.status);
  }
  if (filters.role) {
    params.set('role', filters.role);
  }
  if (filters.institution) {
    params.set('institution', filters.institution);
  }
  params.set('page', String(filters.page ?? 1));
  params.set('pageSize', '20');
  return useQuery({
    queryKey: ['admin', 'users', filters],
    queryFn: () => apiFetch<Page<AdminUserDto>>(`/admin/users?${params.toString()}`),
    enabled,
  });
}

export function useAdminUser(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'users', id],
    queryFn: () => apiFetch<AdminUserDetailDto>(`/admin/users/${id}`),
    enabled: enabled && Boolean(id),
  });
}

export function useSetUserStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { status: string; reason: string; suspendedUntil?: string }) =>
      apiFetch<AdminUserDto>(`/admin/users/${id}/status`, { method: 'PATCH', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useSetUserRoles(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { roles: string[] }) =>
      apiFetch<AdminUserDto>(`/admin/users/${id}/roles`, { method: 'PATCH', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useAdminContributions(status: string | undefined, page: number, enabled: boolean) {
  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (status) {
    params.set('status', status);
  }
  return useQuery({
    queryKey: ['admin', 'contributions', status, page],
    queryFn: () =>
      apiFetch<
        Page<{
          id: string;
          title: string;
          status: string;
          difficulty: string | null;
          topic: string | null;
          contributor: { id: string; username: string | null; displayName: string };
          submittedAt: string;
        }>
      >(`/admin/contributions?${params.toString()}`),
    enabled,
  });
}

export function useAdminContribution(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'contributions', id],
    queryFn: () => apiFetch<ContributionAdminDto>(`/admin/contributions/${id}`),
    enabled: enabled && Boolean(id),
  });
}

function useContributionAction(id: string, action: 'approve' | 'reject' | 'request-changes') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { note?: string; feedback?: string; topicSlug?: string }) =>
      apiFetch<ContributionAdminDto>(`/admin/contributions/${id}/${action}`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'contributions'] });
    },
  });
}

export const useApproveContribution = (id: string) => useContributionAction(id, 'approve');
export const useRejectContribution = (id: string) => useContributionAction(id, 'reject');
export const useRequestChanges = (id: string) => useContributionAction(id, 'request-changes');

export function useEditContribution(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<ContributionAdminDto>(`/admin/contributions/${id}`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'contributions'] });
    },
  });
}

export function usePickupContribution(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ status: string }>(`/admin/contributions/${id}/pickup`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'contributions'] });
    },
  });
}

export function useAnalyzeContribution(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ id: string }>(`/admin/contributions/${id}/analyze`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'contributions', id] });
    },
  });
}

export function useAdminProblems(
  filters: { q?: string; status?: string; page?: number },
  enabled: boolean,
) {
  const params = new URLSearchParams({ page: String(filters.page ?? 1), pageSize: '20' });
  if (filters.q) {
    params.set('q', filters.q);
  }
  if (filters.status) {
    params.set('status', filters.status);
  }
  return useQuery({
    queryKey: ['admin', 'problems', filters],
    queryFn: () => apiFetch<Page<AdminProblemDto>>(`/admin/problems?${params.toString()}`),
    enabled,
  });
}

export function useAdminProblemAction(id: string, action: 'publish' | 'archive' | 'restore') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ id: string }>(`/admin/problems/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'problems'] });
    },
  });
}

export function useDeleteProblem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string; title: string }>(`/admin/problems/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'problems'] });
    },
  });
}

export function useUpdateProblem(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<{ id: string }>(`/admin/problems/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'problems'] });
    },
  });
}

export function useCreateAdminProblem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<{ id: string; title: string; status: string }>('/admin/problems', {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'problems'] });
    },
  });
}

export function useAdminReports(
  filters: { status?: string; targetType?: string; page?: number },
  enabled: boolean,
) {
  const params = new URLSearchParams({ page: String(filters.page ?? 1), pageSize: '20' });
  if (filters.status) {
    params.set('status', filters.status);
  }
  if (filters.targetType) {
    params.set('targetType', filters.targetType);
  }
  return useQuery({
    queryKey: ['admin', 'reports', filters],
    queryFn: () => apiFetch<Page<ReportDto>>(`/admin/reports?${params.toString()}`),
    enabled,
  });
}

export function useResolveReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { status: string; resolution?: string } }) =>
      apiFetch<ReportDto>(`/admin/reports/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] });
    },
  });
}

export function useDiscussionReports(status: string | undefined, page: number, enabled: boolean) {
  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (status) {
    params.set('status', status);
  }
  return useQuery({
    queryKey: ['admin', 'discussion-reports', status, page],
    queryFn: () =>
      apiFetch<Page<DiscussionReportAdminDto>>(`/admin/discussions/reports?${params.toString()}`),
    enabled,
  });
}

export function useFlaggedThreads(page: number, enabled: boolean) {
  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  return useQuery({
    queryKey: ['admin', 'flagged-threads', page],
    queryFn: () =>
      apiFetch<{
        items: Array<{
          id: string;
          title: string;
          author: { id: string; username: string | null; displayName: string };
          hidden: boolean;
          locked: boolean;
          replyCount: number;
          openReports: number;
        }>;
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      }>(`/admin/discussions/flagged?${params.toString()}`),
    enabled,
  });
}

export function useModerationAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body?: Record<string, unknown> }) =>
      apiFetch<{ [key: string]: unknown }>(path, { method: 'POST', body: body ?? {} }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export function useAdminContests(
  filters: { status?: string; q?: string; page?: number },
  enabled: boolean,
) {
  const params = new URLSearchParams({ page: String(filters.page ?? 1), pageSize: '20' });
  if (filters.status) {
    params.set('status', filters.status);
  }
  if (filters.q) {
    params.set('q', filters.q);
  }
  return useQuery({
    queryKey: ['admin', 'contests', filters],
    queryFn: () => apiFetch<Page<AdminContestDto>>(`/admin/contests?${params.toString()}`),
    enabled,
  });
}

export function useContestParticipants(id: string | undefined, page: number, enabled: boolean) {
  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  return useQuery({
    queryKey: ['admin', 'contests', id, 'participants', page],
    queryFn: () =>
      apiFetch<Page<ContestParticipantAdminDto>>(
        `/admin/contests/${id}/participants?${params.toString()}`,
      ),
    enabled: enabled && Boolean(id),
  });
}

export function useCancelContest(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { reason: string }) =>
      apiFetch<{ id: string }>(`/admin/contests/${id}/cancel`, { method: 'POST', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'contests'] });
    },
  });
}

export function useAdminAuditLogs(
  filters: { actorId?: string; action?: string; targetType?: string; page?: number },
  enabled: boolean,
) {
  const params = new URLSearchParams({ page: String(filters.page ?? 1), pageSize: '50' });
  if (filters.actorId) {
    params.set('actorId', filters.actorId);
  }
  if (filters.action) {
    params.set('action', filters.action);
  }
  if (filters.targetType) {
    params.set('targetType', filters.targetType);
  }
  return useQuery({
    queryKey: ['admin', 'audit-logs', filters],
    queryFn: () =>
      apiFetch<{
        items: AuditLogDto[];
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      }>(`/admin/audit-logs?${params.toString()}`),
    enabled,
  });
}
