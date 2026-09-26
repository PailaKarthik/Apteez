import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@apteez/database';
import type { AiReviewDto, ContributionAdminDto, DuplicateCandidateDto } from '@apteez/types';
import { normalizeSlugInput } from '@apteez/validation';
import type {
  AdminContributionsQuery,
  ContributionEditInput,
  ContributionReviewActionInput,
} from '@apteez/validation';
import { EventQueueService } from '../../queue/event-queue.service';
import { StorageService } from '../../storage/storage.service';
import { AiQualityService } from '../ai/ai-quality.service';
import { AiQueueService } from '../ai/ai-queue.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { SimilarProblemService } from '../search/similar-problem.service';
import { ContributionPrecheckService } from '../contribution/contribution-precheck.service';
import { AdminAuditService } from './admin-audit.service';
import type { AdminCaller } from './admin-access';
import { AdminConflictError, AdminNotFoundError, AdminValidationError } from './admin.errors';

interface StoredOption {
  text?: string | null;
  assetKey?: string | null;
  isCorrect?: boolean;
}

interface StoredAsset {
  key?: string | null;
  kind?: string;
  mimeType?: string;
  sizeBytes?: number;
  altText?: string | null;
}

const ASSET_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

/** Stored snapshot is contributor-supplied: re-validate shape, never trust it. */
function normalizeStoredAssets(value: unknown): Array<{
  key: string;
  kind: 'QUESTION_IMAGE' | 'EXPLANATION_IMAGE';
  mimeType: string;
  sizeBytes: number;
  altText: string | null;
}> {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: Array<{
    key: string;
    kind: 'QUESTION_IMAGE' | 'EXPLANATION_IMAGE';
    mimeType: string;
    sizeBytes: number;
    altText: string | null;
  }> = [];
  for (const entry of value.slice(0, 4)) {
    const asset = entry as StoredAsset;
    const key = typeof asset.key === 'string' ? asset.key.trim() : '';
    if (
      !key ||
      key.includes('://') ||
      key.startsWith('/') ||
      key.includes('..') ||
      (asset.kind !== 'QUESTION_IMAGE' && asset.kind !== 'EXPLANATION_IMAGE') ||
      typeof asset.mimeType !== 'string' ||
      !ASSET_MIME_TYPES.has(asset.mimeType) ||
      typeof asset.sizeBytes !== 'number' ||
      !Number.isInteger(asset.sizeBytes) ||
      asset.sizeBytes < 1 ||
      asset.sizeBytes > 5 * 1024 * 1024
    ) {
      continue;
    }
    out.push({
      key,
      kind: asset.kind,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      altText:
        typeof asset.altText === 'string' && asset.altText.trim()
          ? asset.altText.trim().slice(0, 200)
          : null,
    });
  }
  return out;
}

/**
 * Human-owned contribution review. Every state change is claimed atomically
 * (updateMany with a status guard) so double-clicks and retries process a
 * contribution exactly once; approval additionally mints the canonical
 * Problem in the same transaction. AI output — deterministic precheck or a
 * future LangGraph reviewer — is advisory metadata only and can never
 * publish: only approve() creates library content.
 */
@Injectable()
export class AdminContributionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly events: EventQueueService,
    private readonly aiQueue: AiQueueService,
    private readonly precheck: ContributionPrecheckService,
    private readonly similar: SimilarProblemService,
    private readonly analytics: AnalyticsService,
    private readonly quality: AiQualityService,
    private readonly storage: StorageService,
  ) {}

  async queue(query: AdminContributionsQuery): Promise<{
    items: Array<{
      id: string;
      title: string;
      status: string;
      difficulty: string | null;
      topic: string | null;
      contributor: { id: string; username: string | null; displayName: string };
      submittedAt: string;
    }>;
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> {
    const where: Prisma.ContributionWhereInput = query.status
      ? { status: query.status }
      : { status: { in: ['PENDING', 'UNDER_REVIEW'] } };
    const [total, rows] = await Promise.all([
      this.prisma.contribution.count({ where }),
      this.prisma.contribution.findMany({
        where,
        orderBy: [{ submittedAt: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          title: true,
          status: true,
          difficulty: true,
          submittedAt: true,
          contributor: { select: { id: true, username: true, displayName: true } },
          topic: { select: { name: true } },
        },
      }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        difficulty: row.difficulty,
        topic: row.topic?.name ?? null,
        contributor: row.contributor,
        submittedAt: row.submittedAt.toISOString(),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async detail(id: string): Promise<ContributionAdminDto> {
    const row = await this.prisma.contribution.findUnique({
      where: { id },
      include: {
        contributor: { select: { id: true, username: true, displayName: true } },
        reviewer: { select: { id: true, username: true, displayName: true } },
        category: { select: { id: true, name: true, slug: true } },
        topic: { select: { id: true, name: true, slug: true } },
        aiReviews: { orderBy: [{ createdAt: 'desc' }], take: 10 },
      },
    });
    if (!row) {
      throw new AdminNotFoundError('Contribution not found.');
    }
    const options = (row.options as unknown as StoredOption[]).map((option) => ({
      text: option.text ?? null,
      assetKey: option.assetKey ?? null,
      assetUrl: null as string | null,
      isCorrect: option.isCorrect === true,
    }));
    // Reviewers must SEE the images they approve: resolve snapshot keys to
    // read-time URLs (keys alone render nothing).
    const storedAssets = normalizeStoredAssets(row.assets);
    const keys = [
      ...storedAssets.map((asset) => asset.key),
      ...options.flatMap((option) => (option.assetKey ? [option.assetKey] : [])),
    ];
    const urlByKey = await this.storage.getDownloadUrls(keys);
    const assets = storedAssets.map((asset) => ({
      key: asset.key,
      kind: asset.kind,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      altText: asset.altText,
      url: urlByKey.get(asset.key) ?? '',
    }));
    for (const option of options) {
      if (option.assetKey) {
        option.assetUrl = urlByKey.get(option.assetKey) ?? null;
      }
    }
    return {
      id: row.id,
      title: row.title,
      statement: row.statement,
      assets,
      options,
      explanation: row.explanation,
      difficulty: row.difficulty,
      topic: row.topic ? { id: row.topic.id, name: row.topic.name, slug: row.topic.slug } : null,
      category: row.category
        ? { id: row.category.id, name: row.category.name, slug: row.category.slug }
        : null,
      rating: row.rating,
      examTagSlugs: Array.isArray(row.examTags) ? (row.examTags as string[]) : [],
      source: row.source,
      sourceUrl: row.sourceUrl,
      status: row.status,
      contributor: row.contributor,
      reviewer: row.reviewer,
      reviewerNote: row.reviewerNote,
      feedbackForContributor: row.feedbackForContributor,
      submittedAt: row.submittedAt.toISOString(),
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      resultingProblemId: row.resultingProblemId,
      aiReviews: row.aiReviews.map((review) => this.toAiReviewDto(review)),
      duplicateCandidates: await this.duplicateCandidates(row.title, row.statement, row.id),
    };
  }

  async pickup(id: string, caller: AdminCaller): Promise<{ status: string }> {
    const claimed = await this.prisma.contribution.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'UNDER_REVIEW', reviewerId: caller.id },
    });
    if (claimed.count === 0) {
      const current = await this.prisma.contribution.findUnique({
        where: { id },
        select: { status: true, reviewerId: true },
      });
      if (!current) {
        throw new AdminNotFoundError('Contribution not found.');
      }
      if (current.status === 'UNDER_REVIEW' && current.reviewerId === caller.id) {
        return { status: current.status };
      }
      throw new AdminConflictError(
        `Contribution is already ${current.status.toLowerCase().replace('_', ' ')}.`,
      );
    }
    await this.audit.log({
      actorUserId: caller.id,
      action: 'contribution.pickup',
      targetType: 'CONTRIBUTION',
      targetId: id,
    });
    return { status: 'UNDER_REVIEW' };
  }

  async approve(
    id: string,
    input: ContributionReviewActionInput & { topicSlug?: string },
    caller: AdminCaller,
    ip?: string,
  ): Promise<ContributionAdminDto> {
    const existing = await this.prisma.contribution.findUnique({
      where: { id },
      include: { topic: { select: { id: true, categoryId: true } } },
    });
    if (!existing) {
      throw new AdminNotFoundError('Contribution not found.');
    }
    if (existing.status === 'APPROVED') {
      // Idempotent replay: the canonical problem already exists exactly once.
      return this.detail(id);
    }
    if (existing.status !== 'PENDING' && existing.status !== 'UNDER_REVIEW') {
      throw new AdminConflictError('Only pending contributions can be approved.');
    }
    const options = (existing.options as unknown as StoredOption[]).map((option) => ({
      text: option.text ?? null,
      assetKey: option.assetKey ?? null,
      isCorrect: option.isCorrect === true,
    }));
    if (options.length < 2 || options.filter((option) => option.isCorrect).length !== 1) {
      throw new AdminValidationError(
        'Contribution must have at least two options with exactly one answer.',
      );
    }
    let topicId = existing.topicId;
    let categoryId = existing.categoryId ?? existing.topic?.categoryId ?? null;
    // Normalize defensively: a hand-typed "Time and Work" must not become a rejection.
    const rawTopicSlug = input.topicSlug?.trim() ?? '';
    const topicSlug = rawTopicSlug ? normalizeSlugInput(rawTopicSlug) : '';
    if (topicSlug) {
      const topic = await this.prisma.topic.findFirst({
        where: { slug: topicSlug },
        orderBy: { id: 'asc' },
        select: { id: true, categoryId: true },
      });
      if (!topic) {
        throw new AdminValidationError(
          `Unknown topic "${rawTopicSlug}" — pick one from the topic list.`,
        );
      }
      topicId = topic.id;
      categoryId = topic.categoryId;
    }
    if (!categoryId) {
      throw new AdminValidationError(
        'Approval needs a section — edit the contribution to set one first.',
      );
    }
    const storedExams = Array.isArray(existing.examTags) ? existing.examTags : [];
    const wantedExams = [
      ...new Set(storedExams.filter((slug): slug is string => typeof slug === 'string')),
    ];
    let examTagIds: string[] = [];
    if (wantedExams.length > 0) {
      const tags = await this.prisma.examTag.findMany({
        where: { slug: { in: wantedExams }, isActive: true },
        select: { id: true, slug: true },
      });
      const missing = wantedExams.filter((slug) => !tags.some((tag) => tag.slug === slug));
      if (missing.length > 0) {
        throw new AdminValidationError(
          `Unknown or inactive exam tags: ${missing.join(', ')} — edit first.`,
        );
      }
      examTagIds = tags.map((tag) => tag.id);
    }
    const hasImage = options.some((option) => option.assetKey);
    const storedAssets = normalizeStoredAssets(existing.assets);
    const now = new Date();
    // Sequential single statements, never an interactive transaction (the
    // pooler kills those with P2028). The status-guarded claim below is the
    // exactly-once gate; everything after it is idempotent replay-safe.
    const claimed = await this.prisma.contribution.updateMany({
      where: { id, status: { in: ['PENDING', 'UNDER_REVIEW'] } },
      data: {
        status: 'APPROVED',
        reviewerId: caller.id,
        reviewerNote: input.note?.slice(0, 2000) ?? null,
        reviewedAt: now,
      },
    });
    if (claimed.count === 0) {
      throw new AdminConflictError('Contribution was already decided by another reviewer.');
    }
    const problem = await this.prisma.problem.create({
      data: {
        title: existing.title.slice(0, 200),
        statement: existing.statement,
        contentMode: storedAssets.length > 0 || hasImage ? 'TEXT_AND_IMAGE' : 'TEXT_ONLY',
        difficulty: existing.difficulty ?? 'MEDIUM',
        rating: existing.rating ?? 1500,
        status: 'PUBLISHED',
        explanation: existing.explanation,
        source: existing.source,
        creatorId: existing.contributorId,
        categoryId,
        topicId,
        publishedAt: now,
        assets: {
          create: storedAssets.map((asset, index) => ({
            kind: asset.kind,
            objectKey: asset.key,
            mimeType: asset.mimeType,
            sizeBytes: asset.sizeBytes,
            position: index,
            altText: asset.altText,
          })),
        },
        options: {
          create: options.map((option, index) => ({
            position: index,
            text: option.text,
            assetKey: option.assetKey,
            isCorrect: option.isCorrect,
          })),
        },
        ...(examTagIds.length > 0
          ? { exams: { createMany: { data: examTagIds.map((examTagId) => ({ examTagId })) } } }
          : {}),
      },
      select: { id: true },
    });
    await this.prisma.contribution.update({
      where: { id },
      data: { resultingProblemId: problem.id },
    });
    await this.audit.log({
      actorUserId: caller.id,
      action: 'contribution.approve',
      targetType: 'CONTRIBUTION',
      targetId: id,
      previousValue: { status: existing.status } as object,
      newValue: { status: 'APPROVED', problemId: problem.id } as object,
      reason: input.note?.slice(0, 500) ?? null,
      ip: ip ?? null,
    });
    void this.events
      .notifyUser({
        userId: existing.contributorId,
        type: 'CONTRIBUTION_APPROVED',
        title: 'Your contribution was approved.',
        body: `"${existing.title.slice(0, 120)}" is now in the question library.`,
      })
      .catch(() => undefined);
    const minted = await this.prisma.contribution.findUnique({
      where: { id },
      select: { resultingProblemId: true },
    });
    if (minted?.resultingProblemId) {
      // Best-effort vector indexing for Similar Problems; lexical search and
      // the approval itself never depend on it.
      void this.aiQueue.enqueueProblemEmbed(minted.resultingProblemId).catch(() => undefined);
      // A new canonical problem can newly appear in many similar lists.
      void this.similar.invalidateSimilar().catch(() => undefined);
    }
    void this.analytics
      .record('contribution.approved', {
        userId: existing.contributorId,
        metadata: { contributionId: id },
      })
      .catch(() => undefined);
    // Review-quality signal: admin decision vs latest AI recommendation.
    // Best-effort; publication integrity never depends on it.
    void this.quality
      .recordReviewOutcome({ contributionId: id, decision: 'APPROVED', reviewerId: caller.id })
      .catch(() => undefined);
    return this.detail(id);
  }

  async reject(
    id: string,
    input: ContributionReviewActionInput,
    caller: AdminCaller,
    ip?: string,
  ): Promise<ContributionAdminDto> {
    const existing = await this.prisma.contribution.findUnique({ where: { id } });
    if (!existing) {
      throw new AdminNotFoundError('Contribution not found.');
    }
    if (existing.status === 'REJECTED') {
      return this.detail(id);
    }
    if (existing.status !== 'PENDING' && existing.status !== 'UNDER_REVIEW') {
      throw new AdminConflictError('Only pending contributions can be rejected.');
    }
    const now = new Date();
    const claimed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.contribution.updateMany({
        where: { id, status: { in: ['PENDING', 'UNDER_REVIEW'] } },
        data: {
          status: 'REJECTED',
          reviewerId: caller.id,
          reviewerNote: input.note?.slice(0, 2000) ?? null,
          feedbackForContributor: input.feedback?.slice(0, 2000) ?? null,
          reviewedAt: now,
        },
      });
      if (updated.count === 0) {
        return 0;
      }
      await tx.adminAuditLog.create({
        data: {
          actorUserId: caller.id,
          action: 'contribution.reject',
          targetType: 'CONTRIBUTION',
          targetId: id,
          previousValue: { status: existing.status } as object,
          newValue: { status: 'REJECTED' } as object,
          reason: input.note?.slice(0, 500) ?? null,
          ip: ip ?? null,
        },
      });
      return 1;
    });
    if (claimed === 0) {
      // Lost race: another reviewer decided first — surface their state.
      return this.detail(id);
    }
    void this.events
      .notifyUser({
        userId: existing.contributorId,
        type: 'CONTRIBUTION_REJECTED',
        title: 'Your contribution was not accepted.',
        body: (input.feedback ?? 'See reviewer feedback on your contribution.').slice(0, 500),
      })
      .catch(() => undefined);
    void this.quality
      .recordReviewOutcome({ contributionId: id, decision: 'REJECTED', reviewerId: caller.id })
      .catch(() => undefined);
    return this.detail(id);
  }

  async requestChanges(
    id: string,
    input: ContributionReviewActionInput,
    caller: AdminCaller,
    ip?: string,
  ): Promise<ContributionAdminDto> {
    if (!input.feedback || input.feedback.trim().length < 5) {
      throw new AdminValidationError(
        'Requesting changes requires clear feedback for the contributor.',
      );
    }
    const existing = await this.prisma.contribution.findUnique({ where: { id } });
    if (!existing) {
      throw new AdminNotFoundError('Contribution not found.');
    }
    if (existing.status !== 'PENDING' && existing.status !== 'UNDER_REVIEW') {
      throw new AdminConflictError('Only pending contributions can be sent back for changes.');
    }
    // Narrowed once: the closure below would otherwise lose the guard.
    const feedback: string = input.feedback;
    const claimed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.contribution.updateMany({
        where: { id, status: { in: ['PENDING', 'UNDER_REVIEW'] } },
        data: {
          status: 'PENDING',
          reviewerId: caller.id,
          reviewerNote: input.note?.slice(0, 2000) ?? null,
          feedbackForContributor: feedback.slice(0, 2000),
        },
      });
      if (updated.count === 0) {
        return 0;
      }
      await tx.adminAuditLog.create({
        data: {
          actorUserId: caller.id,
          action: 'contribution.request-changes',
          targetType: 'CONTRIBUTION',
          targetId: id,
          previousValue: { status: existing.status } as object,
          newValue: { status: 'PENDING' } as object,
          reason: feedback.slice(0, 500),
          ip: ip ?? null,
        },
      });
      return 1;
    });
    if (claimed === 0) {
      return this.detail(id);
    }
    void this.events
      .notifyUser({
        userId: existing.contributorId,
        type: 'CONTRIBUTION_CHANGES_REQUESTED',
        title: 'Your contribution needs changes.',
        body: feedback.slice(0, 500),
      })
      .catch(() => undefined);
    return this.detail(id);
  }

  /**
   * Reviewer modifications: full content replace on a PENDING/UNDER_REVIEW
   * contribution (statement, options, explanation, taxonomy, rating, folders).
   * Stale AI reviews are dropped like on contributor resubmit — they describe
   * the previous content — and a fresh analysis is scheduled.
   */
  async updateForReview(
    id: string,
    input: ContributionEditInput,
    caller: AdminCaller,
    ip?: string,
  ): Promise<ContributionAdminDto> {
    const existing = await this.prisma.contribution.findUnique({ where: { id } });
    if (!existing) {
      throw new AdminNotFoundError('Contribution not found.');
    }
    if (existing.status !== 'PENDING' && existing.status !== 'UNDER_REVIEW') {
      throw new AdminConflictError('Only pending contributions can be edited.');
    }
    const options = input.options.map((option, index) => ({
      text: option.text ?? null,
      assetKey: option.assetKey ?? null,
      isCorrect: index === input.correctAnswerIndex,
    }));
    const category = await this.prisma.category.findFirst({
      where: { slug: input.categorySlug, isActive: true },
      select: { id: true },
    });
    if (!category) {
      throw new AdminValidationError(`Unknown or inactive section: ${input.categorySlug}.`);
    }
    let topicId: string | null = null;
    const rawEditTopic = input.topicSlug?.trim() ?? '';
    const editTopicSlug = rawEditTopic ? normalizeSlugInput(rawEditTopic) : '';
    if (editTopicSlug) {
      const topic = await this.prisma.topic.findFirst({
        where: { slug: editTopicSlug, categoryId: category.id, isActive: true },
        select: { id: true },
      });
      if (!topic) {
        throw new AdminValidationError(
          `Unknown or inactive topic: ${rawEditTopic} — pick one from the topic list.`,
        );
      }
      topicId = topic.id;
    } else if (input.topic) {
      const topic = await this.prisma.topic.findFirst({
        where: { name: { equals: input.topic, mode: 'insensitive' }, categoryId: category.id },
        select: { id: true },
      });
      topicId = topic?.id ?? null;
    }
    const examTagSlugs = [...new Set(input.examTagSlugs ?? [])];
    if (examTagSlugs.length > 0) {
      const tags = await this.prisma.examTag.findMany({
        where: { slug: { in: examTagSlugs }, isActive: true },
        select: { slug: true },
      });
      const missing = examTagSlugs.filter((slug) => !tags.some((tag) => tag.slug === slug));
      if (missing.length > 0) {
        throw new AdminValidationError(`Unknown or inactive exam tags: ${missing.join(', ')}.`);
      }
    }
    const title =
      input.statement.split(/\s+/).slice(0, 12).join(' ').slice(0, 90) || existing.title;
    await this.prisma.contribution.update({
      where: { id },
      data: {
        title,
        statement: input.statement,
        assets: (input.assets ?? []) as unknown as object,
        options: options as unknown as object,
        explanation: input.explanation,
        difficulty: input.difficulty,
        categoryId: category.id,
        rating: input.rating ?? 1500,
        examTags: examTagSlugs as unknown as object,
        source: input.source?.trim() || null,
        topicId,
        sourceUrl: input.sourceUrl || null,
        reviewerId: existing.reviewerId ?? caller.id,
      },
    });
    await this.prisma.contributionAiReview.deleteMany({ where: { contributionId: id } });
    await this.audit.log({
      actorUserId: caller.id,
      action: 'contribution.edit',
      targetType: 'CONTRIBUTION',
      targetId: id,
      previousValue: { status: existing.status } as object,
      newValue: { status: existing.status, edited: true } as object,
      reason: input.note?.slice(0, 500) ?? null,
      ip: ip ?? null,
    });
    void this.aiQueue.enqueueContributionReview(id).catch(() => undefined);
    return this.detail(id);
  }

  // ─── AI review boundary ─────────────────────────────────────────────

  /**
   * Deterministic precheck: structural issues + real duplicate candidates
   * from the canonical library. Stored with model 'precheck-v1' and labeled
   * as such in the UI — never AI, never publishing.
   */
  async analyze(id: string, caller: AdminCaller): Promise<AiReviewDto> {
    const result = await this.runPrecheck(id);
    await this.audit.log({
      actorUserId: caller.id,
      action: 'contribution.analyze',
      targetType: 'CONTRIBUTION',
      targetId: id,
      newValue: { model: 'precheck-v1', issues: result.issues } as object,
    });
    return result.review;
  }

  /**
   * Shared deterministic precheck (submit auto-run + manual re-run both land
   * here, always on the current row). Thin wrapper: audit stays here, the
   * computation lives in ContributionPrecheckService.
   */
  async runPrecheck(id: string): Promise<{ review: AiReviewDto; issues: number }> {
    const { row, issues } = await this.precheck.runPrecheck(id);
    return { review: this.toAiReviewDto(row), issues };
  }

  /**
   * Store structured analysis from an external reviewer (the AI review
   * worker or an admin-triggered analysis). Validated, advisory, versioned —
   * this endpoint cannot change contribution status.
   */
  async storeAiReview(
    id: string,
    input: {
      model: string;
      suggestedTopic?: string;
      suggestedSubtopic?: string;
      suggestedDifficulty?: 'EASY' | 'MEDIUM' | 'HARD';
      duplicateProbability?: number;
      answerConsistent?: boolean;
      issues: string[];
      recommendation: 'APPROVE' | 'REVIEW' | 'REJECT';
      rawResponse?: unknown;
    },
    caller: AdminCaller,
  ): Promise<AiReviewDto> {
    const existing = await this.prisma.contribution.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new AdminNotFoundError('Contribution not found.');
    }
    const row = await this.prisma.contributionAiReview.create({
      data: {
        contributionId: id,
        model: input.model.slice(0, 80),
        suggestedTopic: input.suggestedTopic?.slice(0, 120) ?? null,
        suggestedSubtopic: input.suggestedSubtopic?.slice(0, 120) ?? null,
        suggestedDifficulty: input.suggestedDifficulty ?? null,
        duplicateProbability: input.duplicateProbability ?? null,
        answerConsistent: input.answerConsistent ?? null,
        issues: input.issues.slice(0, 20) as unknown as object,
        recommendation: input.recommendation,
        rawResponse: (input.rawResponse ?? undefined) as object | undefined,
      },
    });
    await this.audit.log({
      actorUserId: caller.id,
      action: 'contribution.ai-review.store',
      targetType: 'CONTRIBUTION',
      targetId: id,
      newValue: { model: row.model, recommendation: row.recommendation },
    });
    return this.toAiReviewDto(row);
  }

  /** Shared duplicate lookup (submit auto-run + detail view land here). */
  async duplicateCandidates(
    title: string,
    statement: string,
    excludeContributionId?: string,
  ): Promise<DuplicateCandidateDto[]> {
    return this.precheck.duplicateCandidates(title, statement, excludeContributionId);
  }

  private toAiReviewDto(row: {
    id: string;
    model: string;
    suggestedTopic: string | null;
    suggestedSubtopic: string | null;
    suggestedDifficulty: string | null;
    duplicateProbability: number | null;
    answerConsistent: boolean | null;
    issues: unknown;
    recommendation: 'APPROVE' | 'REVIEW' | 'REJECT';
    createdAt: Date;
  }): AiReviewDto {
    const issues = Array.isArray(row.issues)
      ? row.issues.filter((issue): issue is string => typeof issue === 'string')
      : [];
    return {
      id: row.id,
      model: row.model,
      aiGenerated: !row.model.startsWith('precheck'),
      suggestedTopic: row.suggestedTopic,
      suggestedSubtopic: row.suggestedSubtopic,
      suggestedDifficulty: row.suggestedDifficulty,
      duplicateProbability: row.duplicateProbability,
      answerConsistent: row.answerConsistent,
      issues,
      recommendation: row.recommendation,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
