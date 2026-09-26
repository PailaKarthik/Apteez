import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRequestId } from '../../common/context/request-context';
import { AppLogger } from '../../common/logger/app-logger';
import { RedisService } from '../../redis/redis.service';
import { redisKeys } from '../../redis/redis-keys';
import type { Env } from '../../config/env';
import { AiToolRegistry } from './ai-tool-registry';
import { logAiCall } from './ai-observability';
import { AiUsageTrackerService } from './ai-usage-tracker.service';
import type { CoachResponse } from './coach.schemas';
import { COACH_PROMPT_VERSION, buildCoachModel, coachCacheKey, runCoachGraph } from './coach-graph';

export interface CoachResult {
  source: 'llm' | 'deterministic';
  response: CoachResponse;
}

/**
 * Performance Coach over the LangGraph.js agentic workflow (coach-graph):
 * gather (deterministic tools) → reason (LangChain model + bound tools,
 * bounded rounds) → finalize (structured output + repair + text fallback) →
 * ground (ID intersection) → respond, with a deterministic-summary fallback
 * whenever the model is unavailable, over budget, or returns invalid output.
 * Factual statistics always come from backend tools — the model only writes
 * prose around them, so it cannot invent solved counts, accuracy, ratings
 * or weak areas.
 */
const COACH_CACHE_TTL_SECONDS = 600;

@Injectable()
export class PerformanceCoachService {
  constructor(
    private readonly tools: AiToolRegistry,
    private readonly usage: AiUsageTrackerService,
    private readonly redis: RedisService,
    private readonly config: ConfigService<Env, true>,
    private readonly logger: AppLogger,
  ) {}

  private get modelName(): string {
    return this.config.get('LLM_MODEL', { infer: true });
  }

  private get isConfigured(): boolean {
    return Boolean(this.config.get('LLM_API_KEY', { infer: true }));
  }

  async coach(
    userId: string,
    requestId?: string,
    options?: { deterministicOnly?: boolean },
  ): Promise<CoachResult> {
    const startedAt = Date.now();
    // Correlate usage rows + logs with the originating request when the
    // caller did not pass one explicitly (controllers use ALS implicitly).
    const rid = requestId ?? getRequestId();
    if (options?.deterministicOnly) {
      // Feature-flag kill path: the LLM is never touched, but the profile
      // surface keeps working on the deterministic summary.
      return this.fallback(userId, startedAt, rid, 'Disabled by feature flag.');
    }
    const budget = await this.usage.checkBudget(userId, 'performance-coach');
    if (!budget.allowed) {
      return this.fallback(userId, startedAt, rid, 'Daily coaching budget exhausted.');
    }
    if (!this.isConfigured) {
      return this.fallback(userId, startedAt, rid, 'AI provider not configured.');
    }

    let outcome: Awaited<ReturnType<typeof runCoachGraph>> | null = null;
    let failure: string | null = null;
    try {
      outcome = await runCoachGraph(
        { userId, requestId: rid },
        {
          registry: this.tools,
          modelName: this.modelName,
          buildModel: () => buildCoachModel(this.config),
        },
      );
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
    const latencyMs = Date.now() - startedAt;

    if (!outcome?.response) {
      await this.usage.record({
        feature: 'performance-coach',
        model: this.modelName,
        userId,
        latencyMs,
        success: false,
        fallbackUsed: true,
        toolCount: outcome?.toolCallCount ?? null,
        requestId: rid ?? null,
        error: failure ?? outcome?.error ?? 'Graph produced no validated response.',
      });
      logAiCall(this.logger, {
        feature: 'performance-coach',
        requestId: rid,
        model: this.modelName,
        promptVersion: outcome?.promptVersion ?? COACH_PROMPT_VERSION,
        latencyMs,
        success: false,
        validation: 'invalid',
        fallbackUsed: true,
        toolCount: outcome?.toolCallCount,
        error: failure ?? outcome?.error ?? undefined,
      });
      return this.fallback(userId, startedAt, rid, 'Model output failed validation.');
    }

    await this.usage.record({
      feature: 'performance-coach',
      model: this.modelName,
      userId,
      promptTokens: outcome.promptTokens,
      completionTokens: outcome.completionTokens,
      latencyMs,
      success: true,
      toolCount: outcome.toolCallCount ?? null,
      requestId: rid ?? null,
    });
    logAiCall(this.logger, {
      feature: 'performance-coach',
      requestId: rid,
      model: this.modelName,
      promptVersion: outcome.promptVersion,
      latencyMs,
      promptTokens: outcome.promptTokens,
      completionTokens: outcome.completionTokens,
      success: true,
      validation: outcome.validation,
      toolCount: outcome.toolCallCount,
    });
    return { source: 'llm', response: outcome.response };
  }

  /** Deterministic summary: always available, never hallucinated. Cached 10 min. */
  async deterministicSummary(userId: string): Promise<CoachResponse> {
    const cacheKey = redisKeys.aiCoachCache(coachCacheKey(userId));
    try {
      if (this.redis.isReady()) {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached) as CoachResponse;
        }
      }
    } catch {
      // Cache is best-effort; fall through to computation.
    }
    const [performance, weakAreas] = await Promise.all([
      this.tools.execute(userId, 'getUserPerformance', {}),
      this.tools.execute(userId, 'getWeakAreas', {}),
    ]);
    const perf = performance as {
      overall?: { totalSolved?: number; accuracy?: number | null };
      domains?: Array<{ domainName?: string; accuracy?: number | null }>;
    };
    const weak = (weakAreas ?? []) as Array<{ topicName?: string; reason?: string }>;
    const solved = perf.overall?.totalSolved ?? 0;
    const accuracy = perf.overall?.accuracy;
    const result: CoachResponse = {
      summary: `You solved ${solved} problems${accuracy === null || accuracy === undefined ? '' : ` at ${accuracy}% accuracy`}. ${
        weak.length > 0
          ? `Focus next on ${weak
              .slice(0, 3)
              .map((area) => area.topicName ?? 'a weak topic')
              .join(', ')}.`
          : 'Keep a steady practice rhythm across domains.'
      }`,
      strengths: (perf.domains ?? [])
        .filter((domain) => (domain.accuracy ?? 0) >= 75)
        .slice(0, 3)
        .map((domain) => `${domain.domainName ?? 'A domain'} is solid — use it for warm-ups.`),
      weakAreas: weak.slice(0, 5).map((area) => area.reason ?? area.topicName ?? 'Weak area'),
      recommendations: weak
        .slice(0, 3)
        .map((area) => `Drill ${area.topicName ?? 'weak topics'} in short timed sets.`),
      suggestedProblems: [],
      confidence: 'medium',
    };
    try {
      if (this.redis.isReady()) {
        await this.redis.set(cacheKey, JSON.stringify(result), COACH_CACHE_TTL_SECONDS);
      }
    } catch {
      // Best-effort cache write.
    }
    return result;
  }

  private async fallback(
    userId: string,
    startedAt: number,
    requestId: string | undefined,
    reason: string,
  ): Promise<CoachResult> {
    const response = await this.deterministicSummary(userId).catch(() => ({
      summary: 'Practice data is unavailable right now. Try again shortly.',
      strengths: [],
      weakAreas: [],
      recommendations: [],
      suggestedProblems: [],
      confidence: 'low' as const,
    }));
    // Fallbacks are served requests, not invisible ones: the usage row keeps
    // the fallback-rate signal honest for quality monitoring.
    await this.usage.record({
      feature: 'performance-coach',
      model: this.modelName,
      userId,
      latencyMs: Date.now() - startedAt,
      success: true,
      fallbackUsed: true,
      requestId: requestId ?? null,
      error: reason,
    });
    logAiCall(this.logger, {
      feature: 'performance-coach',
      requestId,
      model: this.modelName,
      latencyMs: Date.now() - startedAt,
      success: true,
      fallbackUsed: true,
      error: reason,
    });
    return { source: 'deterministic', response };
  }
}
