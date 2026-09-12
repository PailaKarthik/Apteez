import { Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Body } from '@nestjs/common';
import {
  contestAnswerSchema,
  contestLeaderboardQuerySchema,
  contestListQuerySchema,
  contestReviewSchema,
  contestSuspiciousEventSchema,
  type ContestAnswerInput,
  type ContestLeaderboardQuery,
  type ContestListQuery,
  type ContestReviewInput,
  type ContestSuspiciousEventInput,
} from '@apteez/validation';
import type {
  ContestDetailDto,
  ContestResultDto,
  ContestSessionDto,
  ContestSubmitPreviewDto,
  ContestUpsolveDto,
  ContestLeaderboardEntryDto,
  PaginatedData,
} from '@apteez/types';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { OptionalAuth } from '../../common/decorators/auth.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthRequiredError } from '../auth/auth.errors';
import { ContestService } from './contest.service';

/** Public discovery stays anonymous; every mutation requires a session. */
@Controller('contests')
export class ContestController {
  constructor(private readonly contests: ContestService) {}

  @OptionalAuth()
  @Get()
  async list(
    @Query(new ZodValidationPipe(contestListQuerySchema)) query: ContestListQuery,
    @CurrentUser() user?: RequestUser,
  ): Promise<PaginatedData<import('@apteez/types').ContestSummaryDto>> {
    return this.contests.list(query, user?.id);
  }

  @OptionalAuth()
  @Get(':id')
  async detail(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<ContestDetailDto> {
    return this.contests.detail(id, user?.id);
  }

  @Post(':id/register')
  async register(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<{ registered: boolean; status: string }> {
    if (!user) {
      throw new AuthRequiredError('Sign in to register for this contest.');
    }
    return this.contests.register(id, user.id);
  }

  @Post(':id/start')
  async start(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<ContestSessionDto> {
    if (!user) {
      throw new AuthRequiredError('Sign in to enter this contest.');
    }
    return this.contests.start(id, user.id);
  }

  @Get(':id/session')
  async session(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<ContestSessionDto> {
    if (!user) {
      throw new AuthRequiredError('Sign in to view your contest session.');
    }
    return this.contests.session(id, user.id);
  }

  @Post(':id/questions/:questionId/answer')
  async answer(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('questionId', new ParseUUIDPipe({ version: '4' })) questionId: string,
    @Body(new ZodValidationPipe(contestAnswerSchema)) body: ContestAnswerInput,
    @CurrentUser() user?: RequestUser,
  ): Promise<{ saved: boolean; answeredCount: number; reviewCount: number }> {
    if (!user) {
      throw new AuthRequiredError('Sign in to answer contest questions.');
    }
    return this.contests.answer(id, questionId, user.id, body);
  }

  @Post(':id/questions/:questionId/review')
  async review(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('questionId', new ParseUUIDPipe({ version: '4' })) questionId: string,
    @Body(new ZodValidationPipe(contestReviewSchema)) body: ContestReviewInput,
    @CurrentUser() user?: RequestUser,
  ): Promise<{ saved: boolean; answeredCount: number; reviewCount: number }> {
    if (!user) {
      throw new AuthRequiredError('Sign in to mark contest questions.');
    }
    return this.contests.review(id, questionId, user.id, body);
  }

  @Get(':id/submit-preview')
  async submitPreview(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<ContestSubmitPreviewDto> {
    if (!user) {
      throw new AuthRequiredError('Sign in to submit this contest.');
    }
    return this.contests.submitPreview(id, user.id);
  }

  @Post(':id/submit')
  async submit(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<ContestResultDto> {
    if (!user) {
      throw new AuthRequiredError('Sign in to submit this contest.');
    }
    return this.contests.submit(id, user.id);
  }

  @Get(':id/result')
  async result(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<ContestResultDto> {
    if (!user) {
      throw new AuthRequiredError('Sign in to view your contest result.');
    }
    return this.contests.result(id, user.id);
  }

  @OptionalAuth()
  @Get(':id/leaderboard')
  async leaderboard(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query(new ZodValidationPipe(contestLeaderboardQuerySchema)) query: ContestLeaderboardQuery,
    @CurrentUser() user?: RequestUser,
  ): Promise<PaginatedData<ContestLeaderboardEntryDto>> {
    return this.contests.leaderboard(id, query, user?.id);
  }

  @Get(':id/upsolve')
  async upsolve(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<ContestUpsolveDto> {
    if (!user) {
      throw new AuthRequiredError('Sign in to upsolve this contest.');
    }
    return this.contests.upsolve(id, user.id);
  }

  @Post(':id/events')
  async reportEvent(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(contestSuspiciousEventSchema)) body: ContestSuspiciousEventInput,
    @CurrentUser() user?: RequestUser,
  ): Promise<{ recorded: boolean }> {
    if (!user) {
      throw new AuthRequiredError('Sign in to enter this contest.');
    }
    return this.contests.reportEvent(id, user.id, body);
  }

  @Delete(':id/register')
  async unregister(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<{ registered: boolean }> {
    if (!user) {
      throw new AuthRequiredError('Sign in to manage your registration.');
    }
    return this.contests.unregister(id, user.id);
  }
}
