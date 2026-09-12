'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import type {
  CursorPage,
  FavoriteCollectionDto,
  FavoriteMembershipDto,
  FavoriteProblemDto,
} from '@apteez/types';
import { apiFetch } from '@/lib/api-client';

const COLLECTIONS_KEY = ['favorites', 'collections'] as const;
const FAVORITES_KEY = ['favorites', 'list'] as const;

export interface CollectionProblemsParams {
  sort?: string;
  limit?: number;
}

/** All of the caller's collections, default Favorites first. */
export function useFavoriteCollections() {
  return useQuery({
    queryKey: COLLECTIONS_KEY,
    queryFn: () => apiFetch<FavoriteCollectionDto[]>('/favorite-collections'),
    staleTime: 30_000,
  });
}

/** Paginated problems in the default Favorites collection. */
export function useFavoriteProblems(params: CollectionProblemsParams = {}) {
  const { sort = 'added_desc', limit = 24 } = params;
  return useQuery({
    queryKey: [...FAVORITES_KEY, sort, limit],
    queryFn: () =>
      apiFetch<CursorPage<FavoriteProblemDto>>(`/favorites?sort=${sort}&limit=${limit}`),
    staleTime: 15_000,
  });
}

/** Paginated problems in a specific custom collection. */
export function useCollectionProblems(
  collectionId: string | undefined,
  params: CollectionProblemsParams = {},
) {
  const { sort = 'added_desc', limit = 24 } = params;
  return useQuery({
    queryKey: ['favorites', 'collection', collectionId, sort, limit],
    queryFn: () =>
      apiFetch<CursorPage<FavoriteProblemDto>>(
        `/favorite-collections/${collectionId}/problems?sort=${sort}&limit=${limit}`,
      ),
    enabled: Boolean(collectionId),
    staleTime: 15_000,
  });
}

/** Idempotent favorite toggle bound to the default Favorites collection. */
export function useFavoriteToggle(): UseMutationResult<
  { favorited: boolean },
  Error,
  { problemId: string; next: boolean }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ problemId, next }) =>
      next
        ? apiFetch<{ favorited: boolean }>(`/favorites/${problemId}`, { method: 'POST' })
        : apiFetch<{ favorited: boolean }>(`/favorites/${problemId}`, { method: 'DELETE' }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['favorites'] });
      void queryClient.invalidateQueries({ queryKey: ['problems'] });
    },
  });
}

export function useCreateCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<FavoriteCollectionDto>('/favorite-collections', {
        method: 'POST',
        body: { name },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
    },
  });
}

export function useRenameCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiFetch<FavoriteCollectionDto>(`/favorite-collections/${id}`, {
        method: 'PATCH',
        body: { name },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
    },
  });
}

export function useDeleteCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ deleted: true }>(`/favorite-collections/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
}

export function useAddToCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ collectionId, problemId }: { collectionId: string; problemId: string }) =>
      apiFetch<{ added: true }>(`/favorite-collections/${collectionId}/problems/${problemId}`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['favorites'] });
      void queryClient.invalidateQueries({ queryKey: ['problems'] });
    },
  });
}

export function useRemoveFromCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ collectionId, problemId }: { collectionId: string; problemId: string }) =>
      apiFetch<{ removed: true }>(`/favorite-collections/${collectionId}/problems/${problemId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['favorites'] });
      void queryClient.invalidateQueries({ queryKey: ['problems'] });
    },
  });
}

/** Membership of the given problems in the caller's collections (one call). */
export function useFavoriteMembership(problemIds: string[]) {
  const key = [...problemIds].sort().join(',');
  return useQuery({
    queryKey: ['favorites', 'membership', key],
    queryFn: () =>
      apiFetch<FavoriteMembershipDto[]>(
        `/favorites/membership?problemIds=${encodeURIComponent(problemIds.join(','))}`,
      ),
    enabled: problemIds.length > 0,
    staleTime: 15_000,
  });
}
