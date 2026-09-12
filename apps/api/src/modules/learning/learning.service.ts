import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import type {
  LearningContentBlock,
  LearningLessonDetailDto,
  LearningLessonSummaryDto,
  LearningPathDetailDto,
  LearningPathSummaryDto,
  LearningProgressRowDto,
  LearningProgressSummaryDto,
  LearningTopicDetailDto,
} from '@apteez/types';
import {
  LearningLessonNotFoundError,
  LearningPathNotFoundError,
  LearningTopicNotFoundError,
} from './learning.errors';

/**
 * Structured learning over the shared taxonomy. Content is database-backed;
 * only PUBLISHED rows ever leave this service. Progress is one row per
 * (user, lesson) — never a client-set percentage. Completion requires the
 * explicit server action so "opening a page" never means "done".
 */
@Injectable()
export class LearningService {
  constructor(private readonly prisma: PrismaService) {}

  /** Explore grid: published paths with published topic/lesson counts. */
  async listPaths(userId?: string): Promise<LearningPathSummaryDto[]> {
    const paths = await this.prisma.learningPath.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        difficulty: true,
        icon: true,
        estimatedMinutes: true,
        accessLevel: true,
        topics: {
          where: { status: 'PUBLISHED' },
          select: { id: true, pathId: true, lessonCount: true },
          orderBy: { order: 'asc' },
        },
      },
    });

    const topicIds = paths.flatMap((path) => path.topics.map((topic) => topic.id));
    const progressByTopic = await this.progressByTopic(topicIds, userId);
    const progressByPath = new Map<string, { completed: number; started: number }>();
    for (const path of paths) {
      let completed = 0;
      let started = 0;
      for (const topic of path.topics) {
        const row = progressByTopic.get(topic.id);
        if (row) {
          completed += row.completed;
          started += row.started;
        }
      }
      progressByPath.set(path.id, { completed, started });
    }

    return paths.map((path) => {
      const topicCount = path.topics.length;
      const lessonCount = path.topics.reduce((sum, topic) => sum + topic.lessonCount, 0);
      const summary: LearningPathSummaryDto = {
        id: path.id,
        slug: path.slug,
        title: path.title,
        description: path.description,
        difficulty: path.difficulty,
        icon: path.icon,
        estimatedMinutes: path.estimatedMinutes,
        accessLevel: path.accessLevel,
        topicCount,
        lessonCount,
      };
      if (userId) {
        const count = progressByPath.get(path.id) ?? { completed: 0, started: 0 };
        summary.progress = {
          completedLessons: count.completed,
          startedLessons: count.started,
          completedPercent:
            lessonCount === 0 ? 0 : Math.round((count.completed / lessonCount) * 100),
        };
      }
      return summary;
    });
  }

  /** One domain with its published topics in reading order. */
  async pathDetail(slug: string, userId?: string): Promise<LearningPathDetailDto> {
    const path = await this.prisma.learningPath.findFirst({
      where: { slug, status: 'PUBLISHED' },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        difficulty: true,
        icon: true,
        estimatedMinutes: true,
        accessLevel: true,
        topics: {
          where: { status: 'PUBLISHED' },
          orderBy: { order: 'asc' },
          select: {
            id: true,
            slug: true,
            title: true,
            summary: true,
            order: true,
            estimatedMinutes: true,
            lessonCount: true,
          },
        },
      },
    });
    if (!path) {
      throw new LearningPathNotFoundError();
    }

    const progressByTopic = await this.progressByTopic(
      path.topics.map((topic) => topic.id),
      userId,
    );
    const lessonCount = path.topics.reduce((sum, topic) => sum + topic.lessonCount, 0);
    const summary: LearningPathDetailDto = {
      id: path.id,
      slug: path.slug,
      title: path.title,
      description: path.description,
      difficulty: path.difficulty,
      icon: path.icon,
      estimatedMinutes: path.estimatedMinutes,
      accessLevel: path.accessLevel,
      topicCount: path.topics.length,
      lessonCount,
      topics: path.topics.map((topic) => {
        const count = progressByTopic.get(topic.id);
        return {
          id: topic.id,
          slug: topic.slug,
          title: topic.title,
          summary: topic.summary,
          order: topic.order,
          estimatedMinutes: topic.estimatedMinutes,
          lessonCount: topic.lessonCount,
          completedLessons: count?.completed ?? 0,
          completedPercent:
            topic.lessonCount === 0
              ? 0
              : Math.round(((count?.completed ?? 0) / topic.lessonCount) * 100),
        };
      }),
    };
    if (userId) {
      let completed = 0;
      for (const topic of path.topics) {
        completed += progressByTopic.get(topic.id)?.completed ?? 0;
      }
      summary.progress = {
        completedLessons: completed,
        startedLessons: [...progressByTopic.values()].reduce((sum, row) => sum + row.started, 0),
        completedPercent: lessonCount === 0 ? 0 : Math.round((completed / lessonCount) * 100),
      };
    }
    return summary;
  }

  /** One topic with its published lessons plus viewer progress map. */
  async topicDetail(slug: string, userId?: string): Promise<LearningTopicDetailDto> {
    const topic = await this.prisma.learningTopic.findFirst({
      where: { slug, status: 'PUBLISHED', path: { status: 'PUBLISHED' } },
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        order: true,
        estimatedMinutes: true,
        lessonCount: true,
        path: { select: { slug: true, title: true } },
        lessons: {
          where: { status: 'PUBLISHED' },
          orderBy: { order: 'asc' },
          select: {
            id: true,
            slug: true,
            title: true,
            order: true,
            difficulty: true,
            estimatedMinutes: true,
            accessLevel: true,
            problems: { select: { id: true } },
          },
        },
      },
    });
    if (!topic) {
      throw new LearningTopicNotFoundError();
    }

    const progressByLesson = await this.progressByLesson(
      topic.lessons.map((lesson) => lesson.id),
      userId,
    );
    const progressMap = new Map<string, 'STARTED' | 'COMPLETED'>();
    for (const [lessonId, row] of progressByLesson.entries()) {
      progressMap.set(lessonId, row.status);
    }
    let completed = 0;
    for (const row of progressByLesson.values()) {
      if (row.status === 'COMPLETED') {
        completed += 1;
      }
    }

    return {
      id: topic.id,
      slug: topic.slug,
      title: topic.title,
      summary: topic.summary,
      order: topic.order,
      estimatedMinutes: topic.estimatedMinutes,
      lessonCount: topic.lessonCount,
      completedLessons: userId ? completed : undefined,
      completedPercent: userId
        ? topic.lessonCount === 0
          ? 0
          : Math.round((completed / topic.lessonCount) * 100)
        : undefined,
      path: topic.path,
      lessons: topic.lessons.map((lesson) =>
        this.toLessonSummary(lesson, progressMap.get(lesson.id)),
      ),
      progress: userId ? Object.fromEntries(progressMap) : {},
    };
  }

  /** One lesson with content blocks, practice refs, exams and prev/next nav. */
  async lessonDetail(
    topicSlug: string,
    lessonSlug: string,
    userId?: string,
  ): Promise<LearningLessonDetailDto> {
    const topic = await this.prisma.learningTopic.findFirst({
      where: { slug: topicSlug, status: 'PUBLISHED', path: { status: 'PUBLISHED' } },
      select: {
        id: true,
        slug: true,
        title: true,
        path: { select: { slug: true, title: true } },
      },
    });
    if (!topic) {
      throw new LearningTopicNotFoundError();
    }

    const lesson = await this.prisma.learningLesson.findFirst({
      where: { slug: lessonSlug, topicId: topic.id, status: 'PUBLISHED' },
      select: {
        id: true,
        slug: true,
        title: true,
        order: true,
        difficulty: true,
        estimatedMinutes: true,
        accessLevel: true,
        content: true,
        concept: { select: { title: true } },
        problems: {
          where: { problem: { status: 'PUBLISHED' } },
          orderBy: { order: 'asc' },
          select: {
            practiceCount: true,
            problem: { select: { id: true, title: true } },
          },
        },
        exams: { select: { examTag: { select: { id: true, name: true } } } },
        progress: userId
          ? { where: { userId }, select: { status: true, lastViewedAt: true } }
          : false,
      },
    });
    if (!lesson) {
      throw new LearningLessonNotFoundError();
    }

    const siblings = await this.prisma.learningLesson.findMany({
      where: { topicId: topic.id, status: 'PUBLISHED' },
      orderBy: { order: 'asc' },
      select: { id: true, slug: true, title: true },
    });
    const positionIndex = siblings.findIndex((sibling) => sibling.id === lesson.id);
    const prevLesson = positionIndex > 0 ? siblings[positionIndex - 1]! : null;
    const nextLesson =
      positionIndex >= 0 && positionIndex < siblings.length - 1
        ? siblings[positionIndex + 1]!
        : null;

    const detail: LearningLessonDetailDto = {
      id: lesson.id,
      slug: lesson.slug,
      title: lesson.title,
      order: lesson.order,
      difficulty: lesson.difficulty,
      estimatedMinutes: lesson.estimatedMinutes,
      accessLevel: lesson.accessLevel,
      hasPractice: lesson.problems.length > 0,
      conceptTitle: lesson.concept?.title ?? null,
      content: (lesson.content as unknown as LearningContentBlock[]) ?? [],
      examTags: lesson.exams.map((exam) => exam.examTag),
      practice: lesson.problems.map((entry) => ({
        problemId: entry.problem.id,
        problemTitle: entry.problem.title,
        practiceCount: entry.practiceCount,
      })),
      progressStatus: userId ? (lesson.progress[0]?.status ?? undefined) : undefined,
      navigation: {
        topicSlug: topic.slug,
        topicTitle: topic.title,
        pathSlug: topic.path.slug,
        pathTitle: topic.path.title,
        prevLesson: prevLesson
          ? { id: prevLesson.id, slug: prevLesson.slug, title: prevLesson.title }
          : null,
        nextLesson: nextLesson
          ? { id: nextLesson.id, slug: nextLesson.slug, title: nextLesson.title }
          : null,
        position: positionIndex < 0 ? 0 : positionIndex + 1,
        total: siblings.length,
      },
    };

    // Keep the last-viewed pointer fresh for "Continue Learning".
    if (userId) {
      await this.prisma.userLearningProgress.upsert({
        where: { userId_lessonId: { userId, lessonId: lesson.id } },
        update: { lastViewedAt: new Date() },
        create: { userId, lessonId: lesson.id, status: 'STARTED', lastViewedAt: new Date() },
      });
    }
    return detail;
  }

  /** Authenticated overall + resume pointer. */
  async progressSummary(userId: string): Promise<LearningProgressSummaryDto> {
    const publishedWhere = {
      lesson: {
        status: 'PUBLISHED' as const,
        topic: { status: 'PUBLISHED' as const, path: { status: 'PUBLISHED' as const } },
      },
    };

    const latest = await this.prisma.userLearningProgress.findFirst({
      where: { userId, ...publishedWhere },
      orderBy: { lastViewedAt: 'desc' },
      select: {
        lessonId: true,
        status: true,
        lastViewedAt: true,
        lesson: {
          select: {
            title: true,
            slug: true,
            topic: {
              select: {
                slug: true,
                title: true,
                path: { select: { slug: true, title: true } },
              },
            },
          },
        },
      },
    });

    const [completed, started, total] = await Promise.all([
      this.prisma.userLearningProgress.count({
        where: { userId, status: 'COMPLETED', ...publishedWhere },
      }),
      this.prisma.userLearningProgress.count({ where: { userId, ...publishedWhere } }),
      this.prisma.learningLesson.count({
        where: {
          status: 'PUBLISHED',
          topic: { status: 'PUBLISHED', path: { status: 'PUBLISHED' } },
        },
      }),
    ]);

    return {
      startedLessons: started,
      completedLessons: completed,
      totalPublishedLessons: total,
      completedPercent: total === 0 ? 0 : Math.round((completed / total) * 100),
      resume: latest
        ? {
            lessonId: latest.lessonId,
            lessonTitle: latest.lesson.title,
            lessonSlug: latest.lesson.slug,
            topicSlug: latest.lesson.topic.slug,
            topicTitle: latest.lesson.topic.title,
            pathSlug: latest.lesson.topic.path.slug,
            pathTitle: latest.lesson.topic.path.title,
            lastViewedAt: latest.lastViewedAt.toISOString(),
            status: latest.status,
          }
        : null,
    };
  }

  /** Full per-lesson progress history for a user (profile/continuation UI). */
  async progressRows(userId: string): Promise<LearningProgressRowDto[]> {
    const rows = await this.prisma.userLearningProgress.findMany({
      where: { userId },
      orderBy: { lastViewedAt: 'desc' },
      select: {
        status: true,
        lastViewedAt: true,
        startedAt: true,
        completedAt: true,
        lesson: {
          select: {
            id: true,
            title: true,
            slug: true,
            topic: {
              select: {
                slug: true,
                title: true,
                path: { select: { slug: true, title: true } },
              },
            },
          },
        },
      },
    });
    return rows.map((row) => ({
      lessonId: row.lesson.id,
      lessonTitle: row.lesson.title,
      lessonSlug: row.lesson.slug,
      topicSlug: row.lesson.topic.slug,
      topicTitle: row.lesson.topic.title,
      pathSlug: row.lesson.topic.path.slug,
      pathTitle: row.lesson.topic.path.title,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      lastViewedAt: row.lastViewedAt.toISOString(),
    }));
  }

  /** Explicit start action: idempotent, never downgrades COMPLETED. */
  async startLesson(
    topicSlug: string,
    lessonSlug: string,
    userId: string,
  ): Promise<LearningLessonDetailDto> {
    const lessonId = await this.requirePublishedLesson(topicSlug, lessonSlug);
    await this.prisma.userLearningProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      update: { lastViewedAt: new Date() },
      create: { userId, lessonId, status: 'STARTED' },
    });
    return this.lessonDetail(topicSlug, lessonSlug, userId);
  }

  /** Explicit completion action: idempotent by the (user, lesson) unique. */
  async completeLesson(
    topicSlug: string,
    lessonSlug: string,
    userId: string,
  ): Promise<LearningLessonDetailDto> {
    const lessonId = await this.requirePublishedLesson(topicSlug, lessonSlug);
    await this.prisma.userLearningProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      update: { status: 'COMPLETED', completedAt: new Date(), lastViewedAt: new Date() },
      create: { userId, lessonId, status: 'COMPLETED', completedAt: new Date() },
    });
    return this.lessonDetail(topicSlug, lessonSlug, userId);
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async requirePublishedLesson(topicSlug: string, lessonSlug: string): Promise<string> {
    const lesson = await this.prisma.learningLesson.findFirst({
      where: {
        slug: lessonSlug,
        status: 'PUBLISHED',
        topic: { slug: topicSlug, status: 'PUBLISHED', path: { status: 'PUBLISHED' } },
      },
      select: { id: true },
    });
    if (!lesson) {
      throw new LearningLessonNotFoundError();
    }
    return lesson.id;
  }

  /** Progress rows (lessonId → status) restricted to the given lesson ids. */
  private async progressByLesson(
    lessonIds: string[],
    userId?: string,
  ): Promise<Map<string, { status: 'STARTED' | 'COMPLETED' }>> {
    const map = new Map<string, { status: 'STARTED' | 'COMPLETED' }>();
    if (!userId || lessonIds.length === 0) {
      return map;
    }
    const rows = await this.prisma.userLearningProgress.findMany({
      where: { userId, lessonId: { in: lessonIds } },
      select: { lessonId: true, status: true },
    });
    for (const row of rows) {
      map.set(row.lessonId, { status: row.status });
    }
    return map;
  }

  /** Per-topic completed/started counts across the caller's progress rows. */
  private async progressByTopic(
    topicIds: string[],
    userId?: string,
  ): Promise<Map<string, { completed: number; started: number }>> {
    const map = new Map<string, { completed: number; started: number }>();
    if (!userId || topicIds.length === 0) {
      return map;
    }
    const rows = await this.prisma.userLearningProgress.findMany({
      where: { userId, lesson: { topicId: { in: topicIds } } },
      select: { status: true, lesson: { select: { topicId: true } } },
    });
    for (const row of rows) {
      const current = map.get(row.lesson.topicId) ?? { completed: 0, started: 0 };
      current.started += 1;
      if (row.status === 'COMPLETED') {
        current.completed += 1;
      }
      map.set(row.lesson.topicId, current);
    }
    return map;
  }

  private toLessonSummary(
    lesson: {
      id: string;
      slug: string;
      title: string;
      order: number;
      difficulty: LearningLessonSummaryDto['difficulty'];
      estimatedMinutes: number;
      accessLevel: LearningLessonSummaryDto['accessLevel'];
      problems: { id: string }[];
    },
    progressStatus: 'STARTED' | 'COMPLETED' | undefined,
  ): LearningLessonSummaryDto {
    return {
      id: lesson.id,
      slug: lesson.slug,
      title: lesson.title,
      order: lesson.order,
      difficulty: lesson.difficulty,
      estimatedMinutes: lesson.estimatedMinutes,
      accessLevel: lesson.accessLevel,
      hasPractice: lesson.problems.length > 0,
      progressStatus,
    };
  }
}
