import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import type { DuplicateCandidateDto } from '@apteez/types';
import { withTimeout } from '../../common/utils/with-timeout';
import { EmbeddingService, normalizeEmbeddingText } from '../ai/embedding.service';
import { ContributionNotFoundError } from './contribution.errors';

interface StoredOption {
  text?: string | null;
  assetKey?: string | null;
  isCorrect?: boolean;
}

export interface PrecheckRow {
  id: string;
  model: string;
  suggestedTopic: string | null;
  suggestedSubtopic: string | null;
  suggestedDifficulty: string | null;
  answerConsistent: boolean | null;
  duplicateProbability: number | null;
  issues: unknown;
  recommendation: 'APPROVE' | 'REVIEW' | 'REJECT';
  createdAt: Date;
}

/**
 * Deterministic contribution precheck, shared by the submit path (auto-run)
 * and the reviewer path (manual re-run). Always reads the current row, so it
 * never reports on stale content — resubmits and reviewer edits clear old
 * rows first. Stored with model 'precheck-v1': advisory only, never
 * publishing. Only the human approve() creates library content.
 */
@Injectable()
export class ContributionPrecheckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
  ) {}

  async runPrecheck(contributionId: string): Promise<{ row: PrecheckRow; issues: number }> {
    const existing = await this.prisma.contribution.findUnique({
      where: { id: contributionId },
    });
    if (!existing) {
      throw new ContributionNotFoundError('Contribution not found.');
    }
    const options = (existing.options as unknown as StoredOption[]).map((option) => ({
      text: option.text ?? null,
      assetKey: option.assetKey ?? null,
      isCorrect: option.isCorrect === true,
    }));
    const issues: string[] = [];
    if (options.length < 3) {
      issues.push('Fewer than three options — consider adding distractors.');
    }
    if (options.filter((option) => option.isCorrect).length !== 1) {
      issues.push('The submission does not flag exactly one correct answer.');
    }
    if (!existing.explanation || existing.explanation.trim().length < 20) {
      issues.push('Explanation is missing or too short to teach from.');
    }
    if (existing.statement.trim().length < 50) {
      issues.push('Statement is very short — check it stands alone.');
    }
    const candidates = await this.duplicateCandidates(
      existing.title,
      existing.statement,
      contributionId,
    );
    const top = candidates[0]?.similarity ?? 0;
    if (top >= 0.6) {
      issues.push(`A near-duplicate may exist in the library (similarity ${top.toFixed(2)}).`);
    }
    const row = await this.prisma.contributionAiReview.create({
      data: {
        contributionId,
        model: 'precheck-v1',
        answerConsistent: options.filter((option) => option.isCorrect).length === 1,
        duplicateProbability: top,
        issues: issues as unknown as object,
        recommendation: issues.length === 0 ? 'APPROVE' : 'REVIEW',
      },
    });
    return {
      row: {
        id: row.id,
        model: row.model,
        suggestedTopic: row.suggestedTopic,
        suggestedSubtopic: row.suggestedSubtopic,
        suggestedDifficulty: row.suggestedDifficulty,
        answerConsistent: row.answerConsistent,
        duplicateProbability: row.duplicateProbability,
        issues: row.issues,
        recommendation: row.recommendation,
        createdAt: row.createdAt,
      },
      issues: issues.length,
    };
  }

  /**
   * Real duplicate candidates from two independent channels, unioned by
   * problem id (trigram first, vector-only appended):
   * - trigram similarity over canonical PUBLISHED problem titles (always),
   * - pgvector semantic neighbors of the normalized contribution text, when
   *   the embedding provider is configured (best-effort, 25 s cap).
   * Never synthetic — every candidate is a library row the reviewer can
   * open. `excludeContributionId` is intentionally unused: candidates are
   * canonical problems, never contributions, so there is nothing to exclude.
   */
  async duplicateCandidates(
    title: string,
    statement: string,
    excludeContributionId?: string,
  ): Promise<DuplicateCandidateDto[]> {
    void excludeContributionId;
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; title: string; similarity: number }>
    >`
      SELECT p."id" AS id, p."title" AS title, similarity(p."title", ${title}) AS similarity
      FROM "problems" p
      WHERE p."status" = 'PUBLISHED'
        AND similarity(p."title", ${title}) > 0.15
      ORDER BY similarity DESC
      LIMIT 5`;
    const byId = new Map<string, DuplicateCandidateDto>(
      rows.map((row) => [
        row.id,
        {
          problemId: row.id,
          title: row.title,
          similarity: Number(row.similarity),
          source: 'trigram' as const,
        },
      ]),
    );
    for (const candidate of await this.vectorDuplicateCandidates(title, statement).catch(
      () => [],
    )) {
      const existing = byId.get(candidate.problemId);
      if (existing) {
        existing.source = 'both';
        existing.similarity = Math.max(existing.similarity, candidate.similarity);
      } else {
        byId.set(candidate.problemId, candidate);
      }
    }
    return [...byId.values()]
      .sort((a, b) => b.similarity - a.similarity || (a.problemId < b.problemId ? -1 : 1))
      .slice(0, 8);
  }

  /** Semantic duplicate candidates via pgvector; empty when unavailable. */
  private async vectorDuplicateCandidates(
    title: string,
    statement: string,
  ): Promise<DuplicateCandidateDto[]> {
    if (!this.embeddings.isConfigured()) {
      return [];
    }
    const text = normalizeEmbeddingText([`Title: ${title}`, `Question: ${statement}`]);
    if (!text) {
      return [];
    }
    const triple = this.embeddings.activeTriple();
    const vector = await withTimeout(
      this.embeddings.embedText(text).then((result) => result.vector),
      25_000,
    ).catch(() => null);
    if (!vector) {
      return [];
    }
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; title: string; distance: number }>
    >`
      SELECT p."id" AS id, p."title" AS title,
        (e."embedding" <=> ${JSON.stringify(vector)}::vector) AS distance
      FROM "problem_embeddings" e
      JOIN "problems" p ON p."id" = e."problemId"
      WHERE e."status" = 'READY'
        AND e."model" = ${triple.model}
        AND e."dimensions" = ${triple.dimensions}
        AND e."version" = ${triple.version}
        AND p."status" = 'PUBLISHED'
      ORDER BY e."embedding" <=> ${JSON.stringify(vector)}::vector ASC
      LIMIT 5`.catch(() => []);
    return rows.map((row) => ({
      problemId: row.id,
      title: row.title,
      similarity: Math.max(0, Math.min(1, 1 - Number(row.distance))),
      source: 'vector' as const,
    }));
  }
}
