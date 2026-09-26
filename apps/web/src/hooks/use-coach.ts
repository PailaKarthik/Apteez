'use client';

import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface CoachResponse {
  summary: string;
  strengths: string[];
  weakAreas: string[];
  recommendations: string[];
  suggestedProblems: string[];
  confidence: 'low' | 'medium' | 'high';
}

export interface CoachResult {
  source: 'llm' | 'deterministic';
  response: CoachResponse;
}

/**
 * Performance Coach generation. Explicit user action (no auto-fetch):
 * every run costs model budget, so it only runs on tap. The response is
 * grounded in backend tool data; `source` tells whether the LLM path or
 * the deterministic fallback produced it.
 */
export function usePerformanceCoach() {
  return useMutation({
    mutationFn: () => apiFetch<CoachResult>('/ai/coach', { method: 'POST' }),
    retry: false,
  });
}
