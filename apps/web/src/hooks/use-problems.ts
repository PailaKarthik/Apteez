'use client';

import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  CategoryDto,
  CursorPage,
  ExamTagDto,
  ProblemDetailDto,
  ProblemSummaryDto,
  TopicDto,
} from '@apteez/types';
import { apiFetch } from '@/lib/api-client';

export interface ProblemFilters {
  category?: string;
  topic?: string;
  difficulty?: string;
  exam?: string;
  search?: string;
  ratingMin?: number;
  ratingMax?: number;
  solved?: boolean;
  favorited?: boolean;
  sort?: string;
}

/**
 * Shared query-string builder. `false` booleans are serialized (the API
 * distinguishes `solved=false` from an absent filter); only undefined and
 * empty strings are dropped.
 */
export function toQueryString(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') {
      continue;
    }
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

/** Cursor-paginated problem feed — "load more" rather than page numbers. */
export function useProblemsFeed(filters: ProblemFilters, limit = 12) {
  const query = useInfiniteQuery({
    queryKey: ['problems', 'feed', filters, limit],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiFetch<CursorPage<ProblemSummaryDto>>(
        `/problems${toQueryString({ ...filters, limit, cursor: pageParam })}`,
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });

  return {
    ...query,
    problems: query.data?.pages.flatMap((page) => page.items) ?? [],
  };
}

/**
 * Warm a folder's first page before the user opens it (card hover/focus).
 * Opening then renders instantly from cache instead of fetching on click.
 */
export function usePrefetchProblemsFeed() {
  const queryClient = useQueryClient();
  return (filters: ProblemFilters, limit = 12) =>
    void queryClient.prefetchInfiniteQuery({
      queryKey: ['problems', 'feed', filters, limit],
      initialPageParam: undefined as string | undefined,
      queryFn: ({ pageParam }) =>
        apiFetch<CursorPage<ProblemSummaryDto>>(
          `/problems${toQueryString({ ...filters, limit, cursor: pageParam })}`,
        ),
      getNextPageParam: (lastPage: CursorPage<ProblemSummaryDto>) =>
        lastPage.nextCursor ?? undefined,
      staleTime: 15_000,
    });
}

export function useProblem(id: string | undefined) {
  return useQuery({
    queryKey: ['problems', 'detail', id],
    queryFn: () => apiFetch<ProblemDetailDto>(`/problems/${id}`),
    enabled: Boolean(id),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['catalog', 'categories'],
    queryFn: () => apiFetch<CategoryDto[]>('/categories'),
    staleTime: 5 * 60_000,
  });
}

export function useCategoryTopics(categorySlug: string | undefined) {
  return useQuery({
    queryKey: ['catalog', 'topics', categorySlug],
    queryFn: () => apiFetch<TopicDto[]>(`/categories/${categorySlug}/topics`),
    enabled: Boolean(categorySlug),
    staleTime: 5 * 60_000,
  });
}

export function useExamTags() {
  return useQuery({
    queryKey: ['catalog', 'exam-tags'],
    queryFn: () => apiFetch<ExamTagDto[]>('/exam-tags'),
    staleTime: 5 * 60_000,
  });
}
