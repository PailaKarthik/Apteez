'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  ContinueLearningDto,
  HomeRecommendationsDto,
  RecommendedContestDto,
  RecommendedEventDto,
  RecommendedProblemDto,
  RecommendedTopicDto,
} from '@apteez/types';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from './use-auth';

export function useRecommendedProblems(limit = 5) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['recommendations', 'problems', limit, isAuthenticated],
    queryFn: () =>
      apiFetch<{ items: RecommendedProblemDto[] }>(`/recommendations/problems?limit=${limit}`),
    staleTime: 60_000,
  });
}

export function useRecommendedTopics(limit = 6) {
  return useQuery({
    queryKey: ['recommendations', 'topics', limit],
    queryFn: () =>
      apiFetch<{ items: RecommendedTopicDto[] }>(`/recommendations/topics?limit=${limit}`),
    staleTime: 60_000,
  });
}

export function useContinueLearning(limit = 3) {
  return useQuery({
    queryKey: ['recommendations', 'learning', limit],
    queryFn: () =>
      apiFetch<{ items: ContinueLearningDto[] }>(`/recommendations/learning?limit=${limit}`),
    staleTime: 60_000,
  });
}

export function useRecommendedContests(limit = 3) {
  return useQuery({
    queryKey: ['recommendations', 'contests', limit],
    queryFn: () =>
      apiFetch<{ items: RecommendedContestDto[] }>(`/recommendations/contests?limit=${limit}`),
    staleTime: 60_000,
  });
}

export function useRecommendedEvents(limit = 3) {
  return useQuery({
    queryKey: ['recommendations', 'events', limit],
    queryFn: () =>
      apiFetch<{ items: RecommendedEventDto[] }>(`/recommendations/events?limit=${limit}`),
    staleTime: 60_000,
  });
}

export function useHomeRecommendations() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['recommendations', 'home', isAuthenticated],
    queryFn: () => apiFetch<HomeRecommendationsDto>('/recommendations/home'),
    staleTime: 60_000,
  });
}
