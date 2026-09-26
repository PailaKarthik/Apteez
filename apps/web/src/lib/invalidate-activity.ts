'use client';

import type { QueryClient } from '@tanstack/react-query';

/**
 * Refresh everything derived from today's actions: streak pill, heatmap,
 * performance, recent feeds and practice-area progress. Called after any
 * submitted attempt / completed challenge / submitted contest — otherwise
 * the streak and profile stay stale and "today's first solve" appears to
 * do nothing until caches expire on their own.
 */
export function invalidateActivityQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['profile', 'streak'] });
  void queryClient.invalidateQueries({ queryKey: ['profile', 'heatmap'] });
  void queryClient.invalidateQueries({ queryKey: ['profile', 'performance'] });
  void queryClient.invalidateQueries({ queryKey: ['profile', 'recent'] });
  void queryClient.invalidateQueries({ queryKey: ['profile', 'overview'] });
  void queryClient.invalidateQueries({ queryKey: ['profile', 'points'] });
  void queryClient.invalidateQueries({ queryKey: ['catalog', 'practice-areas'] });
  void queryClient.invalidateQueries({ queryKey: ['ratings'] });
}
