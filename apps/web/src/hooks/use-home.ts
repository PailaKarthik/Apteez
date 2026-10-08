'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ExamPatternDto, PracticeAreaDto, ProblemsCountDto } from '@apteez/types';
import { apiFetch } from '@/lib/api-client';
import { toQueryString } from './use-problems';

export interface LibraryFilters {
  search?: string;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  /** Tri-state: true = solved, false = unsolved, undefined = all. */
  solved?: boolean;
  /** Category slug — narrows the library to one practice area. */
  category?: string;
  /** Exam-tag slug — narrows the library to one exam folder. */
  exam?: string;
}

/** Home exam-pattern folders — live counts, top categories, difficulty mix. */
export function useExamPatterns() {
  return useQuery({
    queryKey: ['catalog', 'exam-patterns'],
    queryFn: () => apiFetch<ExamPatternDto[]>('/exam-patterns'),
    // Server caches this for 5 minutes; mirroring that client-side means
    // repeat visits never pay the pooler round trip at all.
    staleTime: 10 * 60_000,
    gcTime: 15 * 60_000,
    // Comfort: back-nav/refresh keeps showing the last folders while a
    // background refetch refreshes them — never a skeleton flash or an
    // error wall when cache exists.
    placeholderData: keepPreviousData,
  });
}

/**
 * Home practice areas with the caller's solved progress. The backend returns
 * zeros for anonymous callers, so this runs for everyone.
 */
export function usePracticeAreas() {
  return useQuery({
    queryKey: ['catalog', 'practice-areas'],
    queryFn: () => apiFetch<PracticeAreaDto[]>('/practice-areas'),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  });
}

/** Total problems for the current Home library filters (header count). */
export function useProblemsCount(filters: LibraryFilters) {
  return useQuery({
    queryKey: ['problems', 'count', filters],
    queryFn: () =>
      apiFetch<ProblemsCountDto>(
        `/problems/count${toQueryString({
          search: filters.search,
          difficulty: filters.difficulty,
          solved: filters.solved,
          category: filters.category,
          exam: filters.exam,
        })}`,
      ),
    // COUNT scans the same predicate as the feed — keep it warm across
    // filter toggles so typing doesn't re-pay a full scan each keystroke.
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}
