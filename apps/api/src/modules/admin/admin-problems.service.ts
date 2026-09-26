import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import { StorageService } from '../../storage/storage.service';
import { AiQueueService } from '../ai/ai-queue.service';
import { EmbeddingService } from '../ai/embedding.service';
import { SimilarProblemService } from '../search/similar-problem.service';
import type { AdminProblemDto } from '@apteez/types';
import { difficultyForRating } from '@apteez/types';
import type {
  AdminProblemCreateInput,
  AdminProblemPatchInput,
  AdminProblemsQuery,
} from '@apteez/validation';
import { AdminAuditService } from './admin-audit.service';
import type { AdminCaller } from './admin-access';
import { AdminConflictError, AdminNotFoundError, AdminValidationError } from './admin.errors';

/**
 * Canonical problem moderation. Status moves are explicit transitions;
 * metadata edits never touch historical submissions, results or ratings.
 * There is no hard delete: ARCHIVED is the terminal removal state, keeping
 * every foreign-key reference (submissions, contests, events, favorites,
 * discussions) intact.
 */
@Injectable()
export class AdminProblemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly aiQueue: AiQueueService,
    private readonly embeddings: EmbeddingService,
    private readonly similar: SimilarProblemService,
    private readonly storage: StorageService,
  ) {}

  async list(query: AdminProblemsQuery) {
    const where = {
      ...(query.q ? { OR: [{ title: { contains: query.q, mode: 'insensitive' as const } }] } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.problem.count({ where }),
      this.prisma.problem.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          title: true,
          status: true,
          difficulty: true,
          rating: true,
          createdAt: true,
          publishedAt: true,
          category: { select: { name: true } },
          topic: { select: { name: true } },
          _count: { select: { submissions: true } },
        },
      }),
    ]);
    const ids = rows.map((row) => row.id);
    const reports = await this.prisma.report.groupBy({
      by: ['targetId'],
      where: {
        targetType: 'PROBLEM',
        targetId: { in: ids },
        status: { in: ['OPEN', 'UNDER_REVIEW'] },
      },
      _count: { _all: true },
    });
    const correctCounts = await this.prisma.submission.groupBy({
      by: ['problemId'],
      where: { problemId: { in: ids }, status: 'SUBMITTED', isCorrect: true },
      _count: { _all: true },
    });
    const attemptsById = new Map<string, number>();
    const correctById = new Map<string, number>();
    const reportsById = new Map<string, number>();
    for (const row of rows) {
      attemptsById.set(row.id, row._count.submissions);
    }
    // One batched exam-folder lookup for the whole page — never per row.
    const examLinks = await this.prisma.problemExam.findMany({
      where: { problemId: { in: ids } },
      select: { problemId: true, examTag: { select: { slug: true } } },
    });
    const examTagsById = new Map<string, string[]>();
    for (const link of examLinks) {
      const list = examTagsById.get(link.problemId) ?? [];
      list.push(link.examTag.slug);
      examTagsById.set(link.problemId, list);
    }
    for (const row of correctCounts) {
      correctById.set(row.problemId, row._count._all);
    }
    for (const row of reports) {
      reportsById.set(row.targetId, row._count._all);
    }
    const items: AdminProblemDto[] = rows.map((row) => {
      const attempts = attemptsById.get(row.id) ?? 0;
      const correct = correctById.get(row.id) ?? 0;
      return {
        id: row.id,
        title: row.title,
        status: row.status,
        difficulty: row.difficulty,
        rating: row.rating,
        category: row.category.name,
        topic: row.topic?.name ?? null,
        examTags: (examTagsById.get(row.id) ?? []).sort(),
        attempts,
        accuracy: attempts === 0 ? null : Math.round((correct / attempts) * 1000) / 10,
        reports: reportsById.get(row.id) ?? 0,
        createdAt: row.createdAt.toISOString(),
        publishedAt: row.publishedAt?.toISOString() ?? null,
      };
    });
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  /**
   * Direct admin creation (Admin → Problems → New). Slugs resolve to taxonomy
   * rows; unknown/inactive slugs abort with a validation error. The section
   * (category) is required; topic and subtopic are optional. Always goes
   * live at once — there is no draft step on the admin path. Rating is the
   * source of truth for difficulty unless one is given explicitly.
   *
   * Single-statement nested create — deliberately no interactive
   * `$transaction` (the Neon pooler kills those with P2028). Atomicity comes
   * from the single write, not from a multi-statement transaction.
   */
  async create(
    input: AdminProblemCreateInput,
    caller: AdminCaller,
    ip?: string,
  ): Promise<{ id: string; title: string; status: string }> {
    const category = await this.prisma.category.findFirst({
      where: { slug: input.categorySlug, isActive: true },
      select: { id: true },
    });
    if (!category) {
      throw new AdminValidationError(`Unknown or inactive category: ${input.categorySlug}.`);
    }
    let topicId: string | null = null;
    if (input.topicSlug) {
      const topic = await this.prisma.topic.findFirst({
        where: { slug: input.topicSlug, categoryId: category.id, isActive: true },
        select: { id: true },
      });
      if (!topic) {
        throw new AdminValidationError(
          `Unknown or inactive topic: ${input.topicSlug} in category ${input.categorySlug}.`,
        );
      }
      topicId = topic.id;
    }
    let subtopicId: string | null = null;
    if (input.subtopicSlug) {
      if (!topicId) {
        throw new AdminValidationError('Pick a topic before its subtopic.');
      }
      const subtopic = await this.prisma.subtopic.findFirst({
        where: { slug: input.subtopicSlug, topicId, isActive: true },
        select: { id: true },
      });
      if (!subtopic) {
        throw new AdminValidationError(`Unknown or inactive subtopic: ${input.subtopicSlug}.`);
      }
      subtopicId = subtopic.id;
    }
    const wantedExams = [...new Set(input.examTagSlugs)];
    let examTagIds: string[] = [];
    if (wantedExams.length > 0) {
      const tags = await this.prisma.examTag.findMany({
        where: { slug: { in: wantedExams }, isActive: true },
        select: { id: true, slug: true },
      });
      const found = new Set(tags.map((tag) => tag.slug));
      const missing = wantedExams.filter((slug) => !found.has(slug));
      if (missing.length > 0) {
        throw new AdminValidationError(`Unknown or inactive exam tags: ${missing.join(', ')}.`);
      }
      examTagIds = tags.map((tag) => tag.id);
    }
    const difficulty = input.difficulty ?? difficultyForRating(input.rating);
    // Content mode derives from what was attached: images alone, text alone,
    // or both. The list badge (hasImage) reads this without joining assets.
    const contentMode =
      input.assets.length > 0 ? (input.statement ? 'TEXT_AND_IMAGE' : 'IMAGE_ONLY') : 'TEXT_ONLY';
    const now = new Date();
    const created = await this.prisma.problem.create({
      data: {
        title: input.title,
        statement: input.statement ?? null,
        contentMode,
        difficulty,
        rating: input.rating,
        status: 'PUBLISHED',
        publishedAt: now,
        explanation: input.explanation,
        shortcut: input.shortcut,
        source: input.source,
        sourceYear: input.sourceYear,
        creatorId: caller.id,
        categoryId: category.id,
        topicId,
        subtopicId,
        assets: {
          create: input.assets.map((asset, index) => ({
            kind: asset.kind,
            objectKey: asset.key,
            mimeType: asset.mimeType,
            sizeBytes: asset.sizeBytes,
            position: index,
            altText: asset.altText ?? null,
          })),
        },
        options: {
          create: input.options.map((option, index) => ({
            position: index,
            text: option.text ?? null,
            assetKey: option.assetKey ?? null,
            isCorrect: option.isCorrect ?? false,
          })),
        },
        ...(examTagIds.length > 0
          ? { exams: { createMany: { data: examTagIds.map((examTagId) => ({ examTagId })) } } }
          : {}),
      },
      select: { id: true, title: true, status: true },
    });
    await this.audit.log({
      actorUserId: caller.id,
      action: 'problem.create',
      targetType: 'PROBLEM',
      targetId: created.id,
      previousValue: null,
      newValue: { title: input.title, difficulty, rating: input.rating, status: created.status },
      ip,
    });
    void this.embeddings.markStale(created.id).catch(() => undefined);
    void this.aiQueue.enqueueProblemEmbed(created.id).catch(() => undefined);
    return created;
  }

  async update(
    id: string,
    input: AdminProblemPatchInput,
    caller: AdminCaller,
    ip?: string,
  ): Promise<{ id: string; title: string; status: string }> {
    const previous = await this.prisma.problem.findUnique({
      where: { id },
      select: {
        title: true,
        statement: true,
        explanation: true,
        difficulty: true,
        rating: true,
        exams: { select: { examTag: { select: { slug: true } } } },
      },
    });
    if (!previous) {
      throw new AdminNotFoundError('Problem not found.');
    }
    const previousExamTags = previous.exams.map((link) => link.examTag.slug).sort();
    // Rating is the source of truth for difficulty bands (1000–1200 EASY,
    // 1300–1600 MEDIUM, 1700–2000 HARD): a rating change without an explicit
    // difficulty re-derives it so the two can never disagree.
    const effectiveDifficulty =
      input.difficulty ??
      (input.rating !== undefined ? difficultyForRating(input.rating) : undefined);
    // Unknown slugs abort before any write. Sequential single statements
    // (no interactive transaction — the pooler kills those with P2028).
    let examTagIds: string[] | null = null;
    if (input.examTagSlugs !== undefined) {
      const wanted = [...new Set(input.examTagSlugs)];
      const tags = await this.prisma.examTag.findMany({
        where: { slug: { in: wanted }, isActive: true },
        select: { id: true, slug: true },
      });
      const found = new Set(tags.map((tag) => tag.slug));
      const missing = wanted.filter((slug) => !found.has(slug));
      if (missing.length > 0) {
        throw new AdminValidationError(`Unknown or inactive exam tags: ${missing.join(', ')}.`);
      }
      examTagIds = tags.map((tag) => tag.id);
    }
    const updated = await this.prisma.problem.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.statement !== undefined ? { statement: input.statement } : {}),
        ...(input.explanation !== undefined ? { explanation: input.explanation } : {}),
        ...(effectiveDifficulty !== undefined ? { difficulty: effectiveDifficulty } : {}),
        ...(input.rating !== undefined ? { rating: input.rating } : {}),
      },
      select: { id: true, title: true, status: true },
    });
    if (examTagIds !== null) {
      await this.prisma.problemExam.deleteMany({ where: { problemId: id } });
      if (examTagIds.length > 0) {
        await this.prisma.problemExam.createMany({
          data: examTagIds.map((examTagId) => ({ problemId: id, examTagId })),
          skipDuplicates: true,
        });
      }
    }
    await this.audit.log({
      actorUserId: caller.id,
      action: 'problem.update',
      targetType: 'PROBLEM',
      targetId: id,
      previousValue: { ...previous, exams: undefined, examTags: previousExamTags },
      newValue: input,
      ip,
    });
    // Embedding-relevant edits (title/statement/difficulty feed the vector)
    // mark the row stale immediately, then re-index in the background;
    // lexical search never waits. Metadata-only edits keep the vector.
    if (
      input.title !== undefined ||
      input.statement !== undefined ||
      effectiveDifficulty !== undefined
    ) {
      void this.embeddings.markStale(id).catch(() => undefined);
      void this.aiQueue.enqueueProblemEmbed(id).catch(() => undefined);
      void this.similar.invalidateSimilar(id).catch(() => undefined);
    }
    return updated;
  }

  async transition(
    id: string,
    to: 'PUBLISHED' | 'ARCHIVED',
    caller: AdminCaller,
    ip?: string,
  ): Promise<{ id: string; title: string; status: string }> {
    const previous = await this.prisma.problem.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!previous) {
      throw new AdminNotFoundError('Problem not found.');
    }
    const allowed: Record<string, string[]> = {
      DRAFT: ['PUBLISHED', 'ARCHIVED'],
      PENDING_REVIEW: ['PUBLISHED', 'ARCHIVED', 'REJECTED'],
      PUBLISHED: ['ARCHIVED'],
      ARCHIVED: ['PUBLISHED'],
      REJECTED: ['PUBLISHED', 'ARCHIVED'],
    };
    if (!(allowed[previous.status] ?? []).includes(to)) {
      throw new AdminConflictError(`Cannot move problem from ${previous.status} to ${to}.`);
    }
    const now = new Date();
    const updated = await this.prisma.problem.update({
      where: { id },
      data: {
        status: to,
        ...(to === 'PUBLISHED' ? { publishedAt: now } : {}),
      },
      select: { id: true, title: true, status: true },
    });
    await this.audit.log({
      actorUserId: caller.id,
      action: `problem.${to.toLowerCase()}`,
      targetType: 'PROBLEM',
      targetId: id,
      previousValue: { status: previous.status },
      newValue: { status: to },
      ip,
    });
    return updated;
  }

  /**
   * Hard delete. Refuses when the problem is referenced by live data
   * (submissions, favorites, or any challenge/contest/event/lesson slot) so
   * history never dangles; otherwise removes options, assets (files included,
   * best-effort), exam links and the row itself. Audit-logged; reports keep
   * their (string) target reference as a tombstone trail.
   */
  async destroy(
    id: string,
    caller: AdminCaller,
    ip?: string,
  ): Promise<{ id: string; title: string }> {
    const problem = await this.prisma.problem.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        assets: { select: { objectKey: true } },
        options: { select: { assetKey: true } },
      },
    });
    if (!problem) {
      throw new AdminNotFoundError('Problem not found.');
    }
    const [submissions, favorites, challenge, contest, event, lesson] = await Promise.all([
      this.prisma.submission.count({ where: { problemId: id } }),
      this.prisma.favoriteCollectionItem.count({ where: { problemId: id } }),
      this.prisma.challengeQuestion.count({ where: { problemId: id } }),
      this.prisma.contestQuestion.count({ where: { problemId: id } }),
      this.prisma.eventQuestion.count({ where: { problemId: id } }),
      this.prisma.learningLessonProblem.count({ where: { problemId: id } }),
    ]);
    const blockers: string[] = [];
    if (submissions > 0) {
      blockers.push(`${submissions} submission${submissions === 1 ? '' : 's'}`);
    }
    if (favorites > 0) {
      blockers.push(`${favorites} favorite${favorites === 1 ? '' : 's'}`);
    }
    if (challenge + contest + event + lesson > 0) {
      blockers.push('live challenge, contest, event or lesson slots');
    }
    if (blockers.length > 0) {
      throw new AdminConflictError(
        `Cannot delete — still referenced by ${blockers.join(', ')}. Archive it instead.`,
      );
    }
    // Sequential single statements (no interactive transaction — pooler).
    // Options/assets/exams/embeddings cascade from the problem row; storage
    // files are removed best-effort afterwards.
    await this.prisma.problemOption.deleteMany({ where: { problemId: id } });
    await this.prisma.problemAsset.deleteMany({ where: { problemId: id } });
    await this.prisma.problemExam.deleteMany({ where: { problemId: id } });
    await this.prisma.problem.delete({ where: { id } });
    const keys = [
      ...problem.assets.map((asset) => asset.objectKey),
      ...problem.options.flatMap((option) => (option.assetKey ? [option.assetKey] : [])),
    ];
    for (const key of [...new Set(keys)]) {
      void this.storage.delete(key).catch(() => undefined);
    }
    await this.audit.log({
      actorUserId: caller.id,
      action: 'problem.delete',
      targetType: 'PROBLEM',
      targetId: id,
      previousValue: { title: problem.title },
      newValue: null,
      ip,
    });
    return { id, title: problem.title };
  }
}
