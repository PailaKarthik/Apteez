'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ProblemFilterMetadataDto,
  ProblemSummaryDto,
  RecentSearchDto,
  SearchSuggestionsDto,
  TrendingContentDto,
} from '@apteez/types';
import { apiFetch } from '@/lib/api-client';

export type SearchTab =
  'all' | 'PROBLEM' | 'TOPIC' | 'LEARNING' | 'CONTEST' | 'EVENT' | 'DISCUSSION';

export interface SearchParams {
  q: string;
  type?: SearchTab;
  topic?: string;
  difficulty?: string;
  ratingMin?: number;
  ratingMax?: number;
  exam?: string;
  solved?: boolean;
  favorited?: boolean;
  sort?: 'relevance' | 'newest' | 'rating';
  limit?: number;
}

function toQueryString(params: SearchParams, cursor?: string): string {
  const search = new URLSearchParams();
  search.set('q', params.q);
  if (params.type && params.type !== 'all') {
    search.set('type', params.type);
  }
  if (params.topic) {
    search.set('topic', params.topic);
  }
  if (params.difficulty) {
    search.set('difficulty', params.difficulty);
  }
  if (params.ratingMin !== undefined) {
    search.set('ratingMin', String(params.ratingMin));
  }
  if (params.ratingMax !== undefined) {
    search.set('ratingMax', String(params.ratingMax));
  }
  if (params.exam) {
    search.set('exam', params.exam);
  }
  if (params.solved !== undefined) {
    search.set('solved', String(params.solved));
  }
  if (params.favorited !== undefined) {
    search.set('favorited', String(params.favorited));
  }
  if (params.sort) {
    search.set('sort', params.sort);
  }
  search.set('limit', String(params.limit ?? 20));
  if (cursor) {
    search.set('cursor', cursor);
  }
  return search.toString();
}

interface SearchPage {
  items: Array<{ id: string } & Record<string, unknown>>;
  nextCursor: string | null;
  hasNextPage: boolean;
}

/** Single-type paginated search with cursor-based infinite loading. */
export function useSearchResults(params: SearchParams, enabled = true) {
  const { type, ...rest } = params;
  return useInfiniteQuery({
    queryKey: ['search', 'results', params],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiFetch<SearchPage>(
        `/search?${toQueryString({ ...rest, type: type ?? 'PROBLEM' }, pageParam)}`,
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: enabled && params.q.trim().length > 0 && (type ?? 'PROBLEM') !== 'all',
  });
}

export interface GroupedSearch {
  q: string;
  problems: ProblemSummaryDto[];
  topics: Array<{ slug: string; name: string }>;
  learning: unknown[];
  contests: unknown[];
  events: unknown[];
  discussions: unknown[];
}

/** Grouped discovery preview across all types (no pagination). */
export function useGroupedSearch(q: string, enabled = true) {
  return useQuery({
    queryKey: ['search', 'grouped', q],
    queryFn: () => apiFetch<GroupedSearch>(`/search?q=${encodeURIComponent(q)}&type=all`),
    enabled: enabled && q.trim().length > 0,
    staleTime: 30_000,
  });
}

export function useSearchSuggestions(q: string, enabled = true) {
  return useQuery({
    queryKey: ['search', 'suggest', q],
    queryFn: () => apiFetch<SearchSuggestionsDto>(`/search/suggestions?q=${encodeURIComponent(q)}`),
    enabled: enabled && q.trim().length >= 2,
    staleTime: 60_000,
  });
}

export function useTrending(enabled = true) {
  return useQuery({
    queryKey: ['search', 'trending'],
    queryFn: () => apiFetch<TrendingContentDto>('/search/trending'),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useProblemFilters(enabled = true) {
  return useQuery({
    queryKey: ['search', 'filters'],
    queryFn: () => apiFetch<ProblemFilterMetadataDto>('/search/filters/problems'),
    enabled,
    staleTime: 10 * 60_000,
  });
}

export function useRecentSearches(enabled = true) {
  return useQuery({
    queryKey: ['search', 'recent'],
    queryFn: () => apiFetch<{ items: RecentSearchDto[] }>('/search/recent'),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

export interface SimilarProblemHit {
  problem: ProblemSummaryDto;
  score: number;
  source: 'vector' | 'lexical-fallback';
}

/**
 * Similar problems for one canonical problem: pgvector retrieval with
 * metadata filtering and reranking (or a deterministic topic/rating
 * fallback when vectors are unavailable). Results are always real
 * library problems — never generated.
 */
export function useSimilarProblems(problemId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['search', 'similar', problemId],
    queryFn: () =>
      apiFetch<{ items: SimilarProblemHit[] }>(
        `/search/similar?problemId=${encodeURIComponent(problemId ?? '')}&limit=5`,
      ),
    enabled: Boolean(problemId) && enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function useClearRecentSearches() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ cleared: boolean }>('/search/recent', { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['search', 'recent'] });
    },
  });
}

function sessionKey(): string {
  if (typeof window === 'undefined') {
    return 'ssr';
  }
  const existing = window.sessionStorage.getItem('apteez-search-session');
  if (existing) {
    return existing;
  }
  const fresh = Math.random().toString(36).slice(2) + Date.now().toString(36);
  window.sessionStorage.setItem('apteez-search-session', fresh);
  return fresh;
}

/** Fire-and-forget analytics: never awaited by callers, never throws. */
export function useLogSearchEvent() {
  return useMutation({
    mutationFn: (body: {
      event: 'search' | 'click';
      query: string;
      resultType?: string;
      resultId?: string;
    }) =>
      apiFetch<{ recorded: boolean }>('/search/analytics', {
        method: 'POST',
        body: { ...body, sessionKey: sessionKey() },
      }),
    retry: false,
  });
}
