'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  LearningLessonDetailDto,
  LearningPathDetailDto,
  LearningPathSummaryDto,
  LearningProgressRowDto,
  LearningProgressSummaryDto,
  LearningTopicDetailDto,
} from '@apteez/types';
import { apiFetch } from '@/lib/api-client';

export function useLearningPaths() {
  return useQuery({
    queryKey: ['learning', 'paths'],
    queryFn: () => apiFetch<LearningPathSummaryDto[]>('/learning/paths'),
    staleTime: 60_000,
  });
}

export function useLearningPath(slug: string | undefined) {
  return useQuery({
    queryKey: ['learning', 'path', slug],
    queryFn: () => apiFetch<LearningPathDetailDto>(`/learning/paths/${slug}`),
    enabled: Boolean(slug),
    staleTime: 30_000,
  });
}

export function useLearningTopic(slug: string | undefined) {
  return useQuery({
    queryKey: ['learning', 'topic', slug],
    queryFn: () => apiFetch<LearningTopicDetailDto>(`/learning/topics/${slug}`),
    enabled: Boolean(slug),
    staleTime: 30_000,
  });
}

export function useLearningLesson(topicSlug: string | undefined, lessonSlug: string | undefined) {
  return useQuery({
    queryKey: ['learning', 'lesson', topicSlug, lessonSlug],
    queryFn: () =>
      apiFetch<LearningLessonDetailDto>(`/learning/lessons/${topicSlug}/${lessonSlug}`),
    enabled: Boolean(topicSlug) && Boolean(lessonSlug),
    staleTime: 30_000,
  });
}

export function useLearningProgress() {
  return useQuery({
    queryKey: ['learning', 'progress'],
    queryFn: () => apiFetch<LearningProgressSummaryDto>('/learning/progress'),
    staleTime: 30_000,
  });
}

export function useLearningProgressHistory() {
  return useQuery({
    queryKey: ['learning', 'progress', 'history'],
    queryFn: () => apiFetch<LearningProgressRowDto[]>('/learning/progress/history'),
    staleTime: 30_000,
  });
}

/** Invalidate the progress-dependent queries a lesson mutation touches. */
function useLearningCache(): { syncLesson: (lesson: LearningLessonDetailDto) => void } {
  const queryClient = useQueryClient();
  const syncLesson = (lesson: LearningLessonDetailDto): void => {
    queryClient.setQueryData(
      ['learning', 'lesson', lesson.navigation.topicSlug, lesson.slug],
      lesson,
    );
    void queryClient.invalidateQueries({ queryKey: ['learning', 'paths'] });
    void queryClient.invalidateQueries({ queryKey: ['learning', 'path'] });
    void queryClient.invalidateQueries({ queryKey: ['learning', 'topic'] });
    void queryClient.invalidateQueries({ queryKey: ['learning', 'progress'] });
  };
  return { syncLesson };
}

export interface LearningLessonAction {
  topicSlug: string;
  lessonSlug: string;
}

export function useStartLesson() {
  const { syncLesson } = useLearningCache();
  return useMutation({
    mutationFn: ({ topicSlug, lessonSlug }: LearningLessonAction) =>
      apiFetch<LearningLessonDetailDto>(`/learning/lessons/${topicSlug}/${lessonSlug}/start`, {
        method: 'POST',
      }),
    onSuccess: syncLesson,
  });
}

export function useCompleteLesson() {
  const { syncLesson } = useLearningCache();
  return useMutation({
    mutationFn: ({ topicSlug, lessonSlug }: LearningLessonAction) =>
      apiFetch<LearningLessonDetailDto>(`/learning/lessons/${topicSlug}/${lessonSlug}/complete`, {
        method: 'POST',
      }),
    onSuccess: syncLesson,
  });
}
