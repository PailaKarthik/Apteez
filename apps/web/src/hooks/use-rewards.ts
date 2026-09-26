'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  PointsHistoryItemDto,
  PointsSummaryDto,
  RedemptionDto,
  RewardDto,
} from '@apteez/types';
import { apiFetch } from '@/lib/api-client';

export function usePointsBalance() {
  return useQuery({
    queryKey: ['rewards', 'points'],
    queryFn: () => apiFetch<PointsSummaryDto>('/rewards/points'),
    staleTime: 15_000,
  });
}

export function usePointsHistory(page = 1, type?: string) {
  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (type) {
    params.set('type', type);
  }
  return useQuery({
    queryKey: ['rewards', 'history', page, type ?? 'all'],
    queryFn: () =>
      apiFetch<{
        items: PointsHistoryItemDto[];
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      }>(`/rewards/points/history?${params.toString()}`),
    staleTime: 15_000,
  });
}

export function useRewardRules() {
  return useQuery({
    queryKey: ['rewards', 'rules'],
    queryFn: () =>
      apiFetch<{
        items: Array<{
          key: string;
          name: string;
          description: string | null;
          points: number;
          category: string;
          dailyCap: number | null;
          maxPerUser: number | null;
          cooldownSeconds: number | null;
        }>;
      }>('/rewards/rules'),
    staleTime: 60_000,
  });
}

export function useRewardCatalog() {
  return useQuery({
    queryKey: ['rewards', 'catalog'],
    queryFn: () =>
      apiFetch<{
        items: RewardDto[];
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      }>('/rewards/catalog?page=1&pageSize=50'),
    staleTime: 30_000,
  });
}

export function useRedemptions() {
  return useQuery({
    queryKey: ['rewards', 'redemptions'],
    queryFn: () =>
      apiFetch<{
        items: RedemptionDto[];
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      }>('/rewards/redemptions?page=1&pageSize=20'),
    staleTime: 15_000,
  });
}

export function useRedeem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { rewardId: string; idempotencyKey: string }) =>
      apiFetch<RedemptionDto>('/rewards/redeem', { method: 'POST', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rewards'] });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

/**
 * UX-only redeem gate. Mirrors the backend rules for display purposes —
 * the backend revalidates everything authoritatively.
 */
export function canRedeem(
  balance: number,
  reward: { pointsCost: number; stockQuantity: number | null; isActive: boolean },
): { ok: boolean; reason: string | null } {
  if (!reward.isActive) {
    return { ok: false, reason: 'Unavailable' };
  }
  if (reward.stockQuantity !== null && reward.stockQuantity <= 0) {
    return { ok: false, reason: 'Out of stock' };
  }
  if (balance < reward.pointsCost) {
    return { ok: false, reason: 'Not enough points' };
  }
  return { ok: true, reason: null };
}

export function useCancelRedemption() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<RedemptionDto>(`/rewards/redemptions/${id}/cancel`, { method: 'PATCH' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rewards'] });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
