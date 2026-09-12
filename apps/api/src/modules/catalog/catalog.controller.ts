import { Controller, Get, Param, Query } from '@nestjs/common';
import { problemListQuerySchema, type ProblemListQuery } from '@apteez/validation';
import type {
  CategoryDto,
  CursorPage,
  ExamTagDto,
  ProblemSummaryDto,
  TopicDto,
} from '@apteez/types';
import { OptionalAuth } from '../../common/decorators/auth.decorator';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ProblemsService } from '../problems/problems.service';
import { CatalogService } from './catalog.service';

/**
 * Public taxonomy endpoints. Lightweight by design: counts and slugs only —
 * problems are always fetched through their own paginated endpoint.
 */
@Controller()
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly problems: ProblemsService,
  ) {}

  @OptionalAuth()
  @Get('categories')
  async categories(): Promise<CategoryDto[]> {
    return this.catalog.listCategories();
  }

  @OptionalAuth()
  @Get('categories/:slug/topics')
  async topics(@Param('slug') slug: string): Promise<TopicDto[]> {
    return this.catalog.listTopicsByCategory(slug);
  }

  @OptionalAuth()
  @Get('exam-tags')
  async examTags(): Promise<ExamTagDto[]> {
    return this.catalog.listExamTags();
  }

  @OptionalAuth()
  @Get('topics/:slug/problems')
  async problemsByTopic(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(problemListQuerySchema)) query: ProblemListQuery,
    @CurrentUser() user?: RequestUser,
  ): Promise<CursorPage<ProblemSummaryDto>> {
    return this.problems.list({ ...query, topic: slug }, user?.id);
  }
}
