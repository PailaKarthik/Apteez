import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@apteez/database';
import type {
  CategoryDto,
  ExamPatternDifficultyMix,
  ExamPatternDto,
  ExamTagDto,
  PracticeAreaDto,
  TopicDto,
} from '@apteez/types';

/** One grouped footprint row: an exam folder × category × difficulty. */
export interface ExamPatternBucket {
  examTagId: string;
  categoryName: string;
  categorySlug: string;
  difficulty: string;
  count: number;
}

export interface ExamPatternTag {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  problemCount: number;
}

/**
 * Human difficulty label from a real mix. Pure function — directly covered
 * by unit tests. Thresholds are display-only; the underlying counts are
 * always exact.
 */
export function difficultyBand(mix: ExamPatternDifficultyMix): string {
  const total = mix.easy + mix.medium + mix.hard;
  if (total === 0) {
    return 'New';
  }
  const easy = mix.easy / total;
  const medium = mix.medium / total;
  const hard = mix.hard / total;
  if (hard >= 0.4) {
    return 'Hard';
  }
  if (easy >= 0.6) {
    return 'Easy';
  }
  if (easy >= 0.4) {
    return 'Easy–Med';
  }
  if (hard >= 0.25) {
    return 'Med–Hard';
  }
  if (medium >= 0.4) {
    return 'Medium';
  }
  return 'Mixed';
}

/**
 * Assemble Home exam-pattern folders from live tags + footprint buckets.
 * Pure function: tags with no published problems still appear (empty
 * folder), top categories are capped at three with a deterministic
 * count-desc/name-asc order.
 */
export function assembleExamPatterns(
  tags: ExamPatternTag[],
  buckets: ExamPatternBucket[],
): ExamPatternDto[] {
  const byTag = new Map<string, ExamPatternBucket[]>();
  for (const bucket of buckets) {
    const list = byTag.get(bucket.examTagId) ?? [];
    list.push(bucket);
    byTag.set(bucket.examTagId, list);
  }
  return tags.map((tag) => {
    const rows = byTag.get(tag.id) ?? [];
    const mix: ExamPatternDifficultyMix = { easy: 0, medium: 0, hard: 0 };
    const perCategory = new Map<string, { name: string; slug: string; problemCount: number }>();
    for (const row of rows) {
      if (row.difficulty === 'EASY') {
        mix.easy += row.count;
      } else if (row.difficulty === 'HARD') {
        mix.hard += row.count;
      } else {
        mix.medium += row.count;
      }
      const existing = perCategory.get(row.categorySlug);
      if (existing) {
        existing.problemCount += row.count;
      } else {
        perCategory.set(row.categorySlug, {
          name: row.categoryName,
          slug: row.categorySlug,
          problemCount: row.count,
        });
      }
    }
    const topCategories = [...perCategory.values()]
      .sort((a, b) => b.problemCount - a.problemCount || a.name.localeCompare(b.name))
      .slice(0, 3);
    return {
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      description: tag.description,
      problemCount: tag.problemCount,
      topCategories,
      difficultyMix: mix,
      difficultyBand: difficultyBand(mix),
    };
  });
}

/**
 * Read-only taxonomy access: categories, topics/subtopics and exam tags.
 *
 * Latency design (measured): from the regions we serve, one Neon pooler
 * round trip costs ~1.5s and parallel queries do NOT overlap (the pooler
 * serializes them), so every method below is exactly ONE SQL round trip and
 * hot anonymous reads sit behind a 30s in-process cache. Never reintroduce
 * Prisma `_count` here — it fires a COUNT per row (N+1) and each costs the
 * same 1.5s.
 */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** 30s in-process cache for anonymous/shared catalog reads (per instance). */
  private readonly cache = new Map<string, { expiresAt: number; data: unknown }>();

  private cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      return Promise.resolve(hit.data as T);
    }
    return load().then((data) => {
      if (this.cache.size > 200) {
        this.cache.clear();
      }
      this.cache.set(key, { expiresAt: Date.now() + ttlMs, data });
      return data;
    });
  }

  async listCategories(): Promise<CategoryDto[]> {
    return this.cached('categories', 30_000, async () => {
      const rows = await this.prisma.$queryRaw<
        {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          icon: string | null;
          sortOrder: number;
          problemCount: number;
        }[]
      >(Prisma.sql`
        SELECT c."id" AS "id", c."name" AS "name", c."slug" AS "slug",
               c."description" AS "description", c."icon" AS "icon",
               c."sortOrder" AS "sortOrder",
               COUNT(p."id")::int AS "problemCount"
        FROM "categories" c
        LEFT JOIN "problems" p ON p."categoryId" = c."id" AND p."status" = 'PUBLISHED'
        WHERE c."isActive"
        GROUP BY c."id", c."name", c."slug", c."description", c."icon", c."sortOrder"
        ORDER BY c."sortOrder" ASC, c."name" ASC
      `);
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        icon: row.icon,
        sortOrder: row.sortOrder,
        problemCount: Number(row.problemCount),
      }));
    });
  }

  async listTopicsByCategory(categorySlug: string): Promise<TopicDto[]> {
    const category = await this.prisma.category.findFirst({
      where: { slug: categorySlug, isActive: true },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Category not found.',
      });
    }

    // Single round trip: topics + active subtopics (json_agg) + published
    // counts. Prisma include/groupBy here would be 3+ serialized pooler
    // round trips at ~1.5s each.
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        name: string;
        slug: string;
        description: string | null;
        sortOrder: number;
        subtopics: { name: string; slug: string }[] | null;
        problemCount: number;
      }[]
    >(Prisma.sql`
      SELECT t."id" AS "id", t."name" AS "name", t."slug" AS "slug",
             t."description" AS "description", t."sortOrder" AS "sortOrder",
             (
               SELECT COALESCE(json_agg(
                 json_build_object('name', st."name", 'slug', st."slug")
                 ORDER BY st."sortOrder" ASC, st."name" ASC
               ), '[]'::json)
               FROM "subtopics" st
               WHERE st."topicId" = t."id" AND st."isActive"
             ) AS "subtopics",
             COUNT(p."id")::int AS "problemCount"
      FROM "topics" t
      LEFT JOIN "problems" p ON p."topicId" = t."id" AND p."status" = 'PUBLISHED'
      WHERE t."categoryId" = ${category.id}::uuid AND t."isActive"
      GROUP BY t."id", t."name", t."slug", t."description", t."sortOrder"
      ORDER BY t."sortOrder" ASC, t."name" ASC
    `);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      sortOrder: row.sortOrder,
      subtopics: (row.subtopics ?? []).map((st) => ({ name: st.name, slug: st.slug })),
      problemCount: Number(row.problemCount),
    }));
  }

  async listExamTags(): Promise<ExamTagDto[]> {
    return this.cached('exam-tags', 30_000, async () => {
      const rows = await this.prisma.$queryRaw<
        { id: string; name: string; slug: string; description: string | null; problemCount: number }[]
      >(Prisma.sql`
        SELECT t."id" AS "id", t."name" AS "name", t."slug" AS "slug",
               t."description" AS "description",
               COUNT(p."id")::int AS "problemCount"
        FROM "exam_tags" t
        LEFT JOIN "problem_exams" pe ON pe."examTagId" = t."id"
        LEFT JOIN "problems" p ON p."id" = pe."problemId" AND p."status" = 'PUBLISHED'
        WHERE t."isActive"
        GROUP BY t."id", t."name", t."slug", t."description"
        ORDER BY t."name" ASC
      `);
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        problemCount: Number(row.problemCount),
      }));
    });
  }

  /**
   * Home exam-pattern folders. ONE grouped SQL over tags + published
   * problems (buckets and counts derived from the same rows) — a single
   * pooler round trip instead of per-tag queries.
   */
  async listExamPatterns(): Promise<ExamPatternDto[]> {
    return this.cached('exam-patterns', 30_000, async () => {
      const rows = await this.prisma.$queryRaw<
        {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          categoryName: string | null;
          categorySlug: string | null;
          difficulty: string | null;
          count: number;
        }[]
      >(Prisma.sql`
        SELECT t."id" AS "id", t."name" AS "name", t."slug" AS "slug",
               t."description" AS "description",
               c."name" AS "categoryName",
               c."slug" AS "categorySlug",
               p."difficulty" AS "difficulty",
               COUNT(p."id")::int AS "count"
        FROM "exam_tags" t
        LEFT JOIN "problem_exams" pe ON pe."examTagId" = t."id"
        LEFT JOIN "problems" p ON p."id" = pe."problemId" AND p."status" = 'PUBLISHED'
        LEFT JOIN "categories" c ON c."id" = p."categoryId"
        WHERE t."isActive"
        GROUP BY t."id", t."name", t."slug", t."description",
                 c."name", c."slug", p."difficulty"
        ORDER BY t."name" ASC
      `);
      const tags = new Map<string, ExamPatternTag>();
      const buckets: ExamPatternBucket[] = [];
      for (const row of rows) {
        if (!tags.has(row.id)) {
          tags.set(row.id, {
            id: row.id,
            name: row.name,
            slug: row.slug,
            description: row.description,
            problemCount: 0,
          });
        }
        const tag = tags.get(row.id)!;
        tag.problemCount += Number(row.count);
        if (row.categorySlug && row.categoryName && row.difficulty) {
          buckets.push({
            examTagId: row.id,
            categoryName: row.categoryName,
            categorySlug: row.categorySlug,
            difficulty: row.difficulty,
            count: Number(row.count),
          });
        }
      }
      return assembleExamPatterns([...tags.values()], buckets);
    });
  }

  /**
   * Home practice areas: every active category with its live published count
   * plus the caller's solved progress. Anonymous callers get zeros — never
   * another user's numbers. ONE round trip: counts and per-category solved
   * progress come from the same grouped SQL (solved is 0 when logged out).
   */
  async listPracticeAreas(userId?: string): Promise<PracticeAreaDto[]> {
    // Solved progress is per-user: cache anonymous boards globally, user
    // boards per user (30s — progress ticks appear within half a minute).
    return this.cached(`practice-areas:${userId ?? 'anon'}`, 30_000, async () => {
      const rows = await this.prisma.$queryRaw<
        {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          icon: string | null;
          problemCount: number;
          solvedCount: number;
        }[]
      >(
        userId
          ? Prisma.sql`
            SELECT c."id" AS "id", c."name" AS "name", c."slug" AS "slug",
                   c."description" AS "description", c."icon" AS "icon",
                   COUNT(DISTINCT p."id")::int AS "problemCount",
                   COUNT(DISTINCT CASE WHEN s."problemId" IS NOT NULL THEN s."problemId" END)::int AS "solvedCount"
            FROM "categories" c
            LEFT JOIN "problems" p ON p."categoryId" = c."id" AND p."status" = 'PUBLISHED'
            LEFT JOIN "submissions" s ON s."problemId" = p."id"
              AND s."userId" = ${userId}::uuid
              AND s."status" = 'SUBMITTED' AND s."isCorrect"
            WHERE c."isActive"
            GROUP BY c."id", c."name", c."slug", c."description", c."icon",
                     c."sortOrder"
            ORDER BY c."sortOrder" ASC, c."name" ASC
          `
          : Prisma.sql`
            SELECT c."id" AS "id", c."name" AS "name", c."slug" AS "slug",
                   c."description" AS "description", c."icon" AS "icon",
                   COUNT(p."id")::int AS "problemCount",
                   0::int AS "solvedCount"
            FROM "categories" c
            LEFT JOIN "problems" p ON p."categoryId" = c."id" AND p."status" = 'PUBLISHED'
            WHERE c."isActive"
            GROUP BY c."id", c."name", c."slug", c."description", c."icon",
                     c."sortOrder"
            ORDER BY c."sortOrder" ASC, c."name" ASC
          `,
      );
      return rows.map((row) => {
        const problemCount = Number(row.problemCount);
        const solvedCount = Math.min(Number(row.solvedCount), problemCount);
        return {
          id: row.id,
          name: row.name,
          slug: row.slug,
          description: row.description,
          icon: row.icon,
          problemCount,
          solvedCount,
          completionPct:
            problemCount === 0 ? 0 : Math.min(100, Math.round((solvedCount / problemCount) * 100)),
        };
      });
    });
  }
}
