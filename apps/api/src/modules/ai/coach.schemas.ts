import { z } from 'zod';

/**
 * Structured Performance Coach response. Every factual statistic must be
 * grounded in tool output — the service builds the deterministic section
 * itself and only asks the model for prose around it.
 */
export const coachResponseSchema = z.object({
  summary: z.string().min(1).max(2000),
  strengths: z.array(z.string().min(1).max(300)).max(8).default([]),
  weakAreas: z.array(z.string().min(1).max(300)).max(8).default([]),
  recommendations: z.array(z.string().min(1).max(500)).max(8).default([]),
  suggestedProblems: z.array(z.string().uuid()).max(10).default([]),
  confidence: z.enum(['low', 'medium', 'high']).default('medium'),
});

export type CoachResponse = z.infer<typeof coachResponseSchema>;

/** Structured Contribution Review response (advisory only, never publishes). */
export const contributionReviewResponseSchema = z.object({
  topic: z.string().min(1).max(120),
  subtopic: z.string().min(1).max(120).nullable().default(null),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  duplicateProbability: z.number().min(0).max(1),
  answerConsistent: z.boolean(),
  issues: z.array(z.string().min(1).max(500)).max(20).default([]),
  recommendation: z.enum(['APPROVE', 'REVIEW', 'REJECT']),
});

export type ContributionReviewResponse = z.infer<typeof contributionReviewResponseSchema>;
