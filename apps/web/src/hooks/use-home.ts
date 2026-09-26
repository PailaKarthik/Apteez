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
}

/** Home exam-pattern folders — live counts, top categories, difficulty mix. */
export function useExamPatterns() {
  return useQuery({
    queryKey: ['catalog', 'exam-patterns'],
    queryFn: () => apiFetch<ExamPatternDto[]>('/exam-patterns'),
    staleTime: 5 * 60_000,
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
    staleTime: 60_000,
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
        })}`,
      ),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}
