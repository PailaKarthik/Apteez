import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@apteez/database';
import { AppLogger } from '../../common/logger/app-logger';
import type { Env } from '../../config/env';
import { logAiCall } from './ai-observability';
import { AiUsageTrackerService } from './ai-usage-tracker.service';
import type { EmbeddingProvider } from './llm-provider';
import { EMBEDDING_PROVIDER } from './providers';

/**
 * Versioned embedding representation (v1).
 * - v1: "Title/Question/Domain/Difficulty" lines from title, statement,
 *   category/topic/subtopic names, difficulty + rounded rating.
 * - Whitespace-collapsed, HTML-stripped, 8000 chars max.
 * - Image-only problems embed title + taxonomy metadata only; the system
 *   never claims multimodal understanding (no vision model is configured).
 * Bump NORMALIZATION_VERSION when this representation changes; retrieval
 * filters the exact (model, dimensions, version) triple so old and new
 * vectors can never mix or crash pgvector with dimension mismatches.
 */
export const NORMALIZATION_VERSION = 1;
const MAX_EMBED_CHARS = 8000;

/** Deterministic normalization shared by problems and contributions. */
export function normalizeEmbeddingText(parts: Array<string | null | undefined>): string {
  return parts
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) =>
      part
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((part) => part.length > 0)
    .join('\n')
    .slice(0, MAX_EMBED_CHARS);
}

export interface EmbeddingTriple {
  model: string;
  dimensions: number;
  version: number;
}

/** Active triple from environment; the single source for enqueue + filter. */
export function embeddingTriple(config: {
  get(key: 'EMBEDDING_MODEL' | 'EMBEDDING_DIMENSIONS'): string | number;
}): EmbeddingTriple {
  return {
    model: String(config.get('EMBEDDING_MODEL')),
    dimensions: Number(config.get('EMBEDDING_DIMENSIONS')),
    version: NORMALIZATION_VERSION,
  };
}

/**
 * Asynchronous embedding pipeline. Problems are created/updated/approved
 * through the normal flows; this service only (re)generates their vectors.
 * Provider failure marks the row FAILED and retries later — the problem
 * stays fully usable for lexical search meanwhile. Embeddings never mix
 * across models: rows carry model/dimensions/version, and retrieval filters
 * on the active triple.
 */
@Injectable()
export class EmbeddingService {
  constructor(
    @Inject(EMBEDDING_PROVIDER) private readonly embeddings: EmbeddingProvider,
    private readonly prisma: PrismaService,
    private readonly usage: AiUsageTrackerService,
    private readonly config: ConfigService<Env, true>,
    private readonly logger: AppLogger,
  ) {}

  activeTriple(): EmbeddingTriple {
    return {
      model: this.config.get('EMBEDDING_MODEL', { infer: true }),
      dimensions: this.config.get('EMBEDDING_DIMENSIONS', { infer: true }),
      version: NORMALIZATION_VERSION,
    };
  }

  /** Whether vector work is possible (provider key present). */
  isConfigured(): boolean {
    return this.embeddings.isConfigured();
  }

  /**
   * Backfill dry-run preview: counts what a real run would enqueue without
   * enqueueing anything. `missingEmbedding` (PUBLISHED, no row) plus
   * `staleNonReady` (non-READY row on a PUBLISHED problem) is the enqueue
   * set; `readyForTriple` already matches the active triple and is skipped.
   * Always preview before triggering a production backfill.
   */
  async backfillPreview(): Promise<{
    triple: EmbeddingTriple;
    providerConfigured: boolean;
    missingEmbedding: number;
    staleNonReady: number;
    readyForTriple: number;
    wouldEnqueue: number;
  }> {
    const triple = this.activeTriple();
    const [missingEmbedding, staleNonReady, readyForTriple] = await Promise.all([
      this.prisma.problem.count({ where: { status: 'PUBLISHED', embedding: null } }),
      this.prisma.problemEmbedding.count({
        where: { status: { not: 'READY' }, problem: { status: 'PUBLISHED' } },
      }),
      this.prisma.problemEmbedding.count({
        where: {
          status: 'READY',
          model: triple.model,
          dimensions: triple.dimensions,
          version: triple.version,
        },
      }),
    ]);
    return {
      triple,
      providerConfigured: this.isConfigured(),
      missingEmbedding,
      staleNonReady,
      readyForTriple,
      wouldEnqueue: missingEmbedding + staleNonReady,
    };
  }

  /** Single-text embedding for auxiliary flows (duplicate search). */
  async embedText(text: string): Promise<{ vector: number[]; dimensions: number; model: string }> {
    return this.embeddings.embed(text);
  }

  /** Canonical text representation of a problem for embedding + RAG filters. */
  async normalizedText(problemId: string): Promise<string | null> {
    const row = await this.prisma.problem.findUnique({
      where: { id: problemId },
      select: {
        title: true,
        statement: true,
        difficulty: true,
        rating: true,
        status: true,
        category: { select: { name: true } },
        topic: { select: { name: true } },
        subtopic: { select: { name: true } },
      },
    });
    if (!row || row.status !== 'PUBLISHED') {
      return null;
    }
    return normalizeEmbeddingText([
      `Title: ${row.title}`,
      row.statement ? `Question: ${row.statement}` : null,
      `Domain: ${row.category.name}; Topic: ${row.topic?.name ?? 'General'}${row.subtopic ? `; Subtopic: ${row.subtopic.name}` : ''}`,
      `Difficulty: ${row.difficulty}; Rating: ${Math.round(row.rating)}`,
    ]);
  }

  async embedProblem(problemId: string): Promise<{ status: string }> {
    const triple = this.activeTriple();
    if (!this.embeddings.isConfigured()) {
      await this.mark(problemId, triple, 'PENDING', 'Embedding provider not configured.');
      return { status: 'PENDING' };
    }
    const text = await this.normalizedText(problemId);
    if (!text) {
      await this.mark(problemId, triple, 'FAILED', 'Problem missing or unpublished.');
      return { status: 'FAILED' };
    }
    const startedAt = Date.now();
    try {
      const result = await this.embeddings.embed(text.slice(0, 8000));
      if (result.dimensions !== triple.dimensions) {
        throw new Error(
          `Dimension mismatch: provider returned ${result.dimensions}, expected ${triple.dimensions}.`,
        );
      }
      await this.prisma.$executeRaw`
        INSERT INTO "problem_embeddings"
          ("problemId", "model", "dimensions", "version", "status", "error", "generatedAt", "createdAt", "updatedAt", "embedding")
        VALUES (
          ${problemId}::uuid, ${triple.model}, ${triple.dimensions}, ${triple.version},
          'READY', NULL, NOW(), NOW(), NOW(), ${JSON.stringify(result.vector)}::vector
        )
        ON CONFLICT ("problemId") DO UPDATE SET
          "model" = EXCLUDED."model",
          "dimensions" = EXCLUDED."dimensions",
          "version" = EXCLUDED."version",
          "status" = 'READY',
          "error" = NULL,
          "generatedAt" = NOW(),
          "updatedAt" = NOW(),
          "embedding" = EXCLUDED."embedding"`;
      const latencyMs = Date.now() - startedAt;
      await this.usage.record({
        feature: 'embeddings',
        model: triple.model,
        latencyMs,
        success: true,
      });
      logAiCall(this.logger, {
        feature: 'embeddings',
        model: triple.model,
        latencyMs,
        success: true,
      });
      return { status: 'READY' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.mark(problemId, triple, 'FAILED', message);
      await this.usage.record({
        feature: 'embeddings',
        model: triple.model,
        latencyMs: Date.now() - startedAt,
        success: false,
        error: message,
      });
      logAiCall(this.logger, {
        feature: 'embeddings',
        model: triple.model,
        latencyMs: Date.now() - startedAt,
        success: false,
        error: message,
      });
      return { status: 'FAILED' };
    }
  }

  /**
   * Mark a problem's embedding stale (PENDING) when embedding-relevant
   * content changes — title, statement, difficulty, taxonomy. The stale row
   * is excluded from retrieval until the re-embed job rewrites it READY, so
   * outdated vectors never silently persist. Metadata-only edits (rating
   * tweaks, explanations) do not call this.
   */
  async markStale(problemId: string): Promise<void> {
    await this.mark(
      problemId,
      this.activeTriple(),
      'PENDING',
      'Content changed; re-embedding queued.',
    );
  }

  private async mark(
    problemId: string,
    triple: { model: string; dimensions: number; version: number },
    status: string,
    error: string | null,
  ): Promise<void> {
    try {
      await this.prisma.problemEmbedding.upsert({
        where: { problemId },
        update: {
          model: triple.model,
          dimensions: triple.dimensions,
          version: triple.version,
          status,
          error,
        },
        create: {
          problemId,
          model: triple.model,
          dimensions: triple.dimensions,
          version: triple.version,
          status,
          error,
        },
      });
    } catch (dbError) {
      this.logger.warn(
        `ai.embed-mark-failed problem=${problemId} ${dbError instanceof Error ? dbError.message : String(dbError)}`,
        'AI',
      );
    }
  }
}
