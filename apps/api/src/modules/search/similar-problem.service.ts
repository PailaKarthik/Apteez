import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@apteez/database';
import { getRequestId } from '../../common/context/request-context';
import { AppLogger } from '../../common/logger/app-logger';
import { RedisService } from '../../redis/redis.service';
import { REDIS_NAMESPACE, redisKeys } from '../../redis/redis-keys';
import type { Env } from '../../config/env';
import { embeddingTriple, type EmbeddingTriple } from '../ai/embedding.service';
import { ProblemsService } from '../problems/problems.service';
import type { ProblemSummaryDto } from '@apteez/types';

const SIMILAR_CACHE_TTL_SECONDS = 3600;

export interface SimilarProblemHit {
  problem: ProblemSummaryDto;
  score: number;
  source: 'vector' | 'lexical-fallback';
}

export interface VectorCandidate {
  id: string;
  distance: number;
  topicId: string | null;
  subtopicId: string | null;
  difficulty: string;
  rating: number;
  /** Embedding row metadata; absent on hand-built candidates (treated as ineligible). */
  embeddingModel?: string;
  embeddingDimensions?: number;
  embeddingVersion?: number;
  embeddingStatus?: string;
  problemStatus?: string;
}

const DIFFICULTY_RANK: Record<string, number> = { EASY: 0, MEDIUM: 1, HARD: 2 };

/**
 * Blend semantic distance with structural compatibility. Weights are
 * deliberately transparent so evaluation can tune them without touching
 * retrieval: cosine similarity dominates, topic/difficulty/rating agreement
 * rerank — never the reverse.
 */
export function rerankScore(parts: {
  cosineSimilarity: number;
  sameTopic: boolean;
  sameSubtopic: boolean;
  difficultyGap: number;
  ratingGap: number;
}): number {
  let score = parts.cosineSimilarity * 0.6;
  if (parts.sameTopic) {
    score += 0.2;
  }
  if (parts.sameSubtopic) {
    score += 0.1;
  }
  score += Math.max(0, 0.05 * (2 - Math.min(2, parts.difficultyGap)));
  score += Math.max(0, 0.05 * (1 - Math.min(1, parts.ratingGap / 500)));
  return Math.round(score * 1000) / 1000;
}

/**
 * Application-layer retrieval guard, mirrored in SQL. Defense in depth: the
 * vector query already filters, but rows are re-checked here so a stale
 * READY flag, a mixed-model row, or a status race can never leak an
 * unauthorized or incompatible candidate into reranking. Pure function —
 * directly covered by the RAG evaluation suite.
 */
export function isEligibleCandidate(
  sourceProblemId: string,
  triple: EmbeddingTriple,
  candidate: VectorCandidate,
): boolean {
  if (candidate.id === sourceProblemId) {
    return false;
  }
  if (candidate.embeddingStatus !== undefined && candidate.embeddingStatus !== 'READY') {
    return false;
  }
  if (candidate.problemStatus !== undefined && candidate.problemStatus !== 'PUBLISHED') {
    return false;
  }
  if (
    candidate.embeddingModel !== undefined &&
    (candidate.embeddingModel !== triple.model ||
      candidate.embeddingDimensions !== triple.dimensions ||
      candidate.embeddingVersion !== triple.version)
  ) {
    return false;
  }
  return true;
}

/**
 * Similar Problems retrieval: query embedding → pgvector nearest neighbors
 * → metadata filtering → deterministic rerank → top canonical problems.
 * Only PUBLISHED library rows are ever returned; the current problem,
 * rejected contributions and anything unpublished are filtered out. When
 * vectors are unavailable the service falls back to the lexical
 * topic/rating band — never to generated questions.
 */
@Injectable()
export class SimilarProblemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly problems: ProblemsService,
    private readonly redis: RedisService,
    private readonly config: ConfigService<Env, true>,
    private readonly logger: AppLogger,
  ) {}

  private triple(): EmbeddingTriple {
    return embeddingTriple({
      get: (key) => this.config.get(key, { infer: true }) as string | number,
    });
  }

  /**
   * Invalidate cached similar-problem responses. With a problemId, drops
   * that problem's own list (content changed); without one, sweeps all
   * similar keys (a new canonical problem can newly appear in many lists).
   * Best-effort: a missed invalidation only costs a stale read until TTL.
   */
  async invalidateSimilar(problemId?: string): Promise<void> {
    try {
      if (!this.redis.isReady()) {
        return;
      }
      if (problemId) {
        const keys = Array.from({ length: 10 }, (_, index) =>
          redisKeys.aiSimilarCache(`${problemId}:${index + 1}`),
        );
        await this.redis.del(keys);
        return;
      }
      const keys = await this.redis.scanKeys(`${REDIS_NAMESPACE}:ai:similar:*`, 2000);
      if (keys.length > 0) {
        await this.redis.del(keys);
      }
    } catch (error) {
      this.logger.warn(
        `rag.cache-invalidate-failed ${error instanceof Error ? error.message : String(error)}`,
        'Search',
      );
    }
  }

  /**
   * Retrieval with a flag gate: when `ragAllowed` is false (AI_SIMILAR_
   * PROBLEMS off), vector retrieval is skipped entirely and the request is
   * served from the deterministic lexical fallback. Every request records a
   * retrieval telemetry row (best-effort) for fallback-rate monitoring.
   */
  async findSimilar(
    problemId: string,
    limit = 5,
    options?: { ragAllowed?: boolean },
  ): Promise<SimilarProblemHit[]> {
    const startedAt = Date.now();
    const ragAllowed = options?.ragAllowed ?? true;
    const capped = Math.min(Math.max(limit, 1), 10);
    const recordTelemetry = (source: 'vector' | 'lexical-fallback' | 'empty', count: number) => {
      try {
        const latencyMs = Date.now() - startedAt;
        void this.prisma.ragRetrievalLog
          .create({
            data: {
              problemId,
              source,
              resultCount: count,
              latencyMs,
              requestId: getRequestId() ?? null,
            },
          })
          .catch((error: unknown) => {
            this.logger.warn(
              `rag.telemetry-write-failed problem=${problemId} ${error instanceof Error ? error.message : String(error)}`,
              'Search',
            );
          });
      } catch (error) {
        this.logger.warn(
          `rag.telemetry-write-failed problem=${problemId} ${error instanceof Error ? error.message : String(error)}`,
          'Search',
        );
      }
    };
    const cacheKey = redisKeys.aiSimilarCache(`${problemId}:${capped}`);
    try {
      if (this.redis.isReady()) {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached) as SimilarProblemHit[];
        }
      }
    } catch {
      // Best-effort cache; fall through to retrieval.
    }
    const source = await this.prisma.problem.findUnique({
      where: { id: problemId },
      select: {
        id: true,
        status: true,
        topicId: true,
        subtopicId: true,
        difficulty: true,
        rating: true,
      },
    });
    if (!source || source.status !== 'PUBLISHED') {
      recordTelemetry('empty', 0);
      return [];
    }
    const triple = this.triple();
    // Flag kill path: no embedding read, no pgvector query — straight to the
    // deterministic lexical fallback. Telemetry still records the request.
    const vectorHits = !ragAllowed
      ? null
      : await this.vectorSearch(problemId, triple, capped * 4).catch((error) => {
          this.logger.warn(
            `rag.vector-unavailable problem=${problemId} ${error instanceof Error ? error.message : String(error)}`,
            'Search',
          );
          return null;
        });
    const eligible = (vectorHits ?? []).filter((hit) =>
      isEligibleCandidate(problemId, triple, hit),
    );
    if (vectorHits && eligible.length < vectorHits.length) {
      this.logger.warn(
        `rag.filtered-ineligible problem=${problemId} dropped=${vectorHits.length - eligible.length}`,
        'Search',
      );
    }
    const candidates =
      eligible.length > 0
        ? this.rerank(source, eligible).slice(0, capped)
        : await this.lexicalFallback(source, capped);
    const summaries = await this.problems.summarizeProblems(
      undefined,
      candidates.map((candidate) => candidate.id),
    );
    const hits: SimilarProblemHit[] = [];
    for (const candidate of candidates) {
      const problem = summaries.get(candidate.id);
      if (problem) {
        hits.push({ problem, score: candidate.score, source: candidate.source });
      }
    }
    recordTelemetry(
      hits.length === 0 ? 'empty' : eligible.length > 0 ? 'vector' : 'lexical-fallback',
      hits.length,
    );
    try {
      if (this.redis.isReady() && hits.length > 0) {
        await this.redis.set(cacheKey, JSON.stringify(hits), SIMILAR_CACHE_TTL_SECONDS);
      }
    } catch {
      // Best-effort cache write.
    }
    return hits;
  }

  private async vectorSearch(
    problemId: string,
    triple: EmbeddingTriple,
    take: number,
  ): Promise<VectorCandidate[]> {
    const rows = await this.prisma.$queryRaw<Array<VectorCandidate & { distance: number }>>`
      WITH query AS (
        SELECT "embedding" AS vec FROM "problem_embeddings"
        WHERE "problemId" = ${problemId}::uuid
          AND "status" = 'READY'
          AND "model" = ${triple.model}
          AND "dimensions" = ${triple.dimensions}
          AND "version" = ${triple.version}
      )
      SELECT
        p."id" AS id,
        p."topicId" AS "topicId",
        p."subtopicId" AS "subtopicId",
        p."difficulty"::text AS difficulty,
        p."rating" AS rating,
        e."model" AS "embeddingModel",
        e."dimensions" AS "embeddingDimensions",
        e."version" AS "embeddingVersion",
        e."status" AS "embeddingStatus",
        p."status"::text AS "problemStatus",
        (e."embedding" <=> (SELECT vec FROM query)) AS distance
      FROM "problem_embeddings" e
      JOIN "problems" p ON p."id" = e."problemId"
      WHERE e."problemId" <> ${problemId}::uuid
        AND e."status" = 'READY'
        AND e."model" = ${triple.model}
        AND e."dimensions" = ${triple.dimensions}
        AND e."version" = ${triple.version}
        AND p."status" = 'PUBLISHED'
      ORDER BY e."embedding" <=> (SELECT vec FROM query) ASC
      LIMIT ${take}`;
    return rows;
  }

  private rerank(
    source: {
      topicId: string | null;
      subtopicId: string | null;
      difficulty: string;
      rating: number;
    },
    candidates: VectorCandidate[],
  ): Array<{ id: string; score: number; source: 'vector' }> {
    return candidates
      .map((candidate) => ({
        id: candidate.id,
        source: 'vector' as const,
        score: rerankScore({
          cosineSimilarity: 1 - candidate.distance,
          // Two topic-less problems share nothing meaningful: no bonus.
          sameTopic:
            candidate.topicId !== null &&
            source.topicId !== null &&
            candidate.topicId === source.topicId,
          sameSubtopic:
            candidate.subtopicId !== null &&
            source.subtopicId !== null &&
            candidate.subtopicId === source.subtopicId,
          difficultyGap: Math.abs(
            (DIFFICULTY_RANK[candidate.difficulty] ?? 1) -
              (DIFFICULTY_RANK[source.difficulty] ?? 1),
          ),
          ratingGap: Math.abs(candidate.rating - source.rating),
        }),
      }))
      .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  }

  /** Deterministic fallback: same topic, nearby rating, difficulty-aware. */
  private async lexicalFallback(
    source: { id: string; topicId: string | null; difficulty: string; rating: number },
    take: number,
  ): Promise<Array<{ id: string; score: number; source: 'lexical-fallback' }>> {
    const rows = await this.prisma.problem.findMany({
      where: {
        status: 'PUBLISHED',
        // Topic-less sources match on rating band alone (topicId: null would
        // otherwise only match other topic-less rows — same thing, explicit).
        ...(source.topicId ? { topicId: source.topicId } : { topicId: null }),
        id: { not: source.id },
        rating: { gte: source.rating - 400, lte: source.rating + 400 },
      },
      orderBy: [{ rating: 'asc' }, { id: 'asc' }],
      take: take * 2,
      select: { id: true, difficulty: true, rating: true },
    });
    return rows
      .map((row) => ({
        id: row.id,
        source: 'lexical-fallback' as const,
        score: rerankScore({
          cosineSimilarity: 0.5,
          sameTopic: true,
          sameSubtopic: false,
          difficultyGap: Math.abs(
            (DIFFICULTY_RANK[row.difficulty] ?? 1) - (DIFFICULTY_RANK[source.difficulty] ?? 1),
          ),
          ratingGap: Math.abs(row.rating - source.rating),
        }),
      }))
      .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
      .slice(0, take);
  }
}
