import { Controller, Get, Param, Post } from '@nestjs/common';
import { learningLessonParamsSchema, type LearningLessonParams } from '@apteez/validation';
import type {
  LearningLessonDetailDto,
  LearningPathDetailDto,
  LearningPathSummaryDto,
  LearningProgressRowDto,
  LearningProgressSummaryDto,
  LearningTopicDetailDto,
} from '@apteez/types';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { OptionalAuth } from '../../common/decorators/auth.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthRequiredError } from '../auth/auth.errors';
import { LearningService } from './learning.service';

/**
 * Public learning reads (content is discoverable without sign-in); progress
 * reads/mutations always require a session. Completion is server-side and
 * idempotent — the client can never set a percentage or mark content done
 * without hitting these endpoints.
 */
@Controller('learning')
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  @OptionalAuth()
  @Get('paths')
  async listPaths(@CurrentUser() user?: RequestUser): Promise<LearningPathSummaryDto[]> {
    return this.learning.listPaths(user?.id);
  }

  @OptionalAuth()
  @Get('paths/:slug')
  async pathDetail(
    @Param('slug') slug: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<LearningPathDetailDto> {
    return this.learning.pathDetail(slug, user?.id);
  }

  @OptionalAuth()
  @Get('topics/:slug')
  async topicDetail(
    @Param('slug') slug: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<LearningTopicDetailDto> {
    return this.learning.topicDetail(slug, user?.id);
  }

  @OptionalAuth()
  @Get('lessons/:topicSlug/:lessonSlug')
  async lessonDetail(
    @Param(new ZodValidationPipe(learningLessonParamsSchema)) params: LearningLessonParams,
    @CurrentUser() user?: RequestUser,
  ): Promise<LearningLessonDetailDto> {
    return this.learning.lessonDetail(params.topicSlug, params.lessonSlug, user?.id);
  }

  @Get('progress')
  async progress(@CurrentUser() user?: RequestUser): Promise<LearningProgressSummaryDto> {
    if (!user) {
      throw new AuthRequiredError('Sign in to view your learning progress.');
    }
    return this.learning.progressSummary(user.id);
  }

  @Get('progress/history')
  async progressHistory(@CurrentUser() user?: RequestUser): Promise<LearningProgressRowDto[]> {
    if (!user) {
      throw new AuthRequiredError('Sign in to view your learning history.');
    }
    return this.learning.progressRows(user.id);
  }

  @Post('lessons/:topicSlug/:lessonSlug/start')
  async startLesson(
    @Param(new ZodValidationPipe(learningLessonParamsSchema)) params: LearningLessonParams,
    @CurrentUser() user?: RequestUser,
  ): Promise<LearningLessonDetailDto> {
    if (!user) {
      throw new AuthRequiredError('Sign in to start a lesson.');
    }
    return this.learning.startLesson(params.topicSlug, params.lessonSlug, user.id);
  }

  @Post('lessons/:topicSlug/:lessonSlug/complete')
  async completeLesson(
    @Param(new ZodValidationPipe(learningLessonParamsSchema)) params: LearningLessonParams,
    @CurrentUser() user?: RequestUser,
  ): Promise<LearningLessonDetailDto> {
    if (!user) {
      throw new AuthRequiredError('Sign in to complete a lesson.');
    }
    return this.learning.completeLesson(params.topicSlug, params.lessonSlug, user.id);
  }
}
