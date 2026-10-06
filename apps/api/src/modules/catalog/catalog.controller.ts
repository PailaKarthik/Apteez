import { Controller, Get, Param, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { problemListQuerySchema, type ProblemListQuery } from '@apteez/validation';
import type {
  CategoryDto,
  CursorPage,
  ExamPatternDto,
  ExamTagDto,
  PracticeAreaDto,
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
  @SkipThrottle()
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
  @SkipThrottle()
  @Get('exam-tags')
  async examTags(): Promise<ExamTagDto[]> {
    return this.catalog.listExamTags();
  }

  /**
   * Home exam-pattern folders: live counts, top categories and difficulty
   * mix per exam tag. Public; per-user data never included.
   */
  @OptionalAuth()
  @SkipThrottle()
  @Get('exam-patterns')
  async examPatterns(): Promise<ExamPatternDto[]> {
    return this.catalog.listExamPatterns();
  }

  /**
   * Home practice areas: categories with live counts plus the caller's own
   * solved progress (zeros when signed out).
   */
  @OptionalAuth()
  @SkipThrottle()
  @Get('practice-areas')
  async practiceAreas(@CurrentUser() user?: RequestUser): Promise<PracticeAreaDto[]> {
    return this.catalog.listPracticeAreas(user?.id);
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
