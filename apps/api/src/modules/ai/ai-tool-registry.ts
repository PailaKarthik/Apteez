import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { CoachToolsService } from '../profile/coach-tools.service';

export interface AiToolDefinition {
  /** Stable name the (future) agent uses to call this tool. */
  name: string;
  description: string;
  input: z.ZodTypeAny;
  run: (userId: string, input: unknown) => Promise<unknown>;
}

const limitSchema = z.object({ limit: z.number().int().min(1).max(50).default(20) });
const topicSchema = z.object({ topicSlug: z.string().min(1).max(120).optional() });

/**
 * Controlled tool boundary for the future Performance Coach
 * (LangGraph.js + LangChain.js). Every tool:
 * - takes an explicit, already-authorized userId (never ambient auth),
 * - validates input with Zod before touching services,
 * - delegates to CoachToolsService (application services, never SQL),
 * - returns JSON-serializable data only.
 * Tools cannot read other users, write business data, or reach secrets.
 */
@Injectable()
export class AiToolRegistry {
  constructor(private readonly tools: CoachToolsService) {}

  definitions(): AiToolDefinition[] {
    return [
      {
        name: 'getUserPerformance',
        description: 'Overall and per-domain performance for the authorized user.',
        input: z.object({}),
        run: (userId) => this.tools.getUserPerformance(userId),
      },
      {
        name: 'getTopicPerformance',
        description: 'Per-topic performance, optionally narrowed to one topic slug.',
        input: topicSchema,
        run: (userId, input) =>
          this.tools.getTopicPerformance(userId, (input as { topicSlug?: string }).topicSlug),
      },
      {
        name: 'getRecentSubmissions',
        description: 'Recent finalized submissions with taxonomy context (no correct answers).',
        input: limitSchema,
        run: (userId, input) =>
          this.tools.getRecentSubmissions(userId, (input as { limit: number }).limit),
      },
      {
        name: 'getChallengeHistory',
        description: 'Rated 1v1 challenge history for the authorized user.',
        input: limitSchema,
        run: (userId, input) =>
          this.tools.getChallengeHistory(userId, (input as { limit: number }).limit),
      },
      {
        name: 'getContestHistory',
        description: 'Contest results with contest context.',
        input: limitSchema,
        run: (userId, input) =>
          this.tools.getContestHistory(userId, (input as { limit: number }).limit),
      },
      {
        name: 'getLearningProgress',
        description: 'Learning progress summary plus recently touched lessons.',
        input: z.object({}),
        run: (userId) => this.tools.getLearningProgress(userId),
      },
      {
        name: 'getWeakAreas',
        description: 'Deterministic weak-area signals (multi-signal, threshold-gated).',
        input: z.object({}),
        run: (userId) => this.tools.getWeakAreas(userId),
      },
      {
        name: 'getProblemsForTopic',
        description: 'Canonical published problems for a topic (RAG retrieval set).',
        input: z.object({
          topicSlug: z.string().min(1).max(120),
          limit: z.number().int().min(1).max(20).default(5),
        }),
        run: (_userId, input) => {
          const parsed = input as { topicSlug: string; limit: number };
          return this.tools.getProblemsForTopic(parsed.topicSlug, parsed.limit);
        },
      },
    ];
  }

  /** Execute a named tool with validated input for one authorized user. */
  async execute(userId: string, name: string, input: unknown): Promise<unknown> {
    const tool = this.definitions().find((definition) => definition.name === name);
    if (!tool) {
      throw new Error(`Unknown AI tool: ${name}.`);
    }
    const parsed = tool.input.safeParse(input ?? {});
    if (!parsed.success) {
      throw new Error(`Invalid input for AI tool ${name}.`);
    }
    return tool.run(userId, parsed.data);
  }
}
