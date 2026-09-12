import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import type { CategoryDto, ExamTagDto, TopicDto } from '@apteez/types';

const PUBLISHED = { status: 'PUBLISHED' } as const;

/**
 * Read-only taxonomy access: categories, topics/subtopics and exam tags.
 * Counts are filtered relation counts, so the numbers always describe the
 * published library and cost a single query per level.
 */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories(): Promise<CategoryDto[]> {
    const rows = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        icon: true,
        sortOrder: true,
        _count: { select: { problems: { where: PUBLISHED } } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      icon: row.icon,
      sortOrder: row.sortOrder,
      problemCount: row._count.problems,
    }));
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

    const rows = await this.prisma.topic.findMany({
      where: { categoryId: category.id, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        sortOrder: true,
        subtopics: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: { name: true, slug: true },
        },
        _count: { select: { problems: { where: PUBLISHED } } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      sortOrder: row.sortOrder,
      subtopics: row.subtopics,
      problemCount: row._count.problems,
    }));
  }

  async listExamTags(): Promise<ExamTagDto[]> {
    const rows = await this.prisma.examTag.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        _count: { select: { problems: { where: { problem: PUBLISHED } } } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      problemCount: row._count.problems,
    }));
  }
}
