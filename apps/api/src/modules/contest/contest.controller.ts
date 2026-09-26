import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  contestAnswerSchema,
  contestLeaderboardQuerySchema,
  contestListQuerySchema,
  contestQuestionAddSchema,
  contestRatingLeaderboardQuerySchema,
  contestReviewSchema,
  contestSuspiciousEventSchema,
  contestCreateSchema,
  organizerContestPatchSchema,
  type ContestAnswerInput,
  type ContestCreateInput,
  type ContestLeaderboardQuery,
  type ContestListQuery,
  type ContestQuestionAddInput,
  type ContestRatingLeaderboardQuery,
  type ContestReviewInput,
  type ContestSuspiciousEventInput,
  type OrganizerContestPatchInput,
} from '@apteez/validation';
import type {
  ContestDetailDto,
  ContestDraftDto,
  ContestManageDto,
  ContestRatingLeaderboardEntryDto,
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
import { callerOf, requireArea } from '../admin/admin-access';
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
  @Get('ratings/leaderboard')
  async ratingLeaderboard(
    @Query(new ZodValidationPipe(contestRatingLeaderboardQuerySchema))
    query: ContestRatingLeaderboardQuery,
  ): Promise<ContestRatingLeaderboardEntryDto[]> {
    return this.contests.ratingLeaderboard(query.institution, query.limit);
  }

  /** Resume list: unfinished DRAFT setups the caller may manage. */
  @Get('drafts')
  async drafts(@CurrentUser() user?: RequestUser): Promise<ContestDraftDto[]> {
    const caller = requireArea(callerOf(user), 'contests');
    return this.contests.listDrafts(caller);
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

  // Finalization recomputes ranks and applies ratings: own ceiling below
  // the global default against finalize spam.
  @Throttle({ default: { limit: 30, ttl: 60000 } })
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

  // Client-reported telemetry: cheap to store, easy to spam — own ceiling.
  @Throttle({ default: { limit: 30, ttl: 60000 } })
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

  // ─── Organizer management (manage:contests + own-contest ownership) ──────

  /** Step 1: create the DRAFT format (question count + length first). */
  @Post()
  async create(
    @Body(new ZodValidationPipe(contestCreateSchema)) body: ContestCreateInput,
    @CurrentUser() user?: RequestUser,
  ): Promise<ContestManageDto> {
    const caller = requireArea(callerOf(user), 'contests');
    return this.contests.createContest(caller, body);
  }

  @Get(':id/manage')
  async manage(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<ContestManageDto> {
    const caller = requireArea(callerOf(user), 'contests');
    return this.contests.manageView(id, caller);
  }

  @Patch(':id')
  async updateDraft(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(organizerContestPatchSchema)) body: OrganizerContestPatchInput,
    @CurrentUser() user?: RequestUser,
  ): Promise<ContestManageDto> {
    const caller = requireArea(callerOf(user), 'contests');
    return this.contests.updateDraft(id, caller, body);
  }

  /** Step 2: attach one published problem (positions append in order). */
  @Post(':id/questions')
  async addQuestion(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(contestQuestionAddSchema)) body: ContestQuestionAddInput,
    @CurrentUser() user?: RequestUser,
  ): Promise<ContestManageDto> {
    const caller = requireArea(callerOf(user), 'contests');
    return this.contests.addQuestion(id, caller, body);
  }

  @Delete(':id/questions/:questionId')
  async removeQuestion(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('questionId', new ParseUUIDPipe({ version: '4' })) questionId: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<ContestManageDto> {
    const caller = requireArea(callerOf(user), 'contests');
    return this.contests.removeQuestion(id, caller, questionId);
  }

  @Post(':id/publish')
  async publish(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<ContestManageDto> {
    const caller = requireArea(callerOf(user), 'contests');
    return this.contests.publishContest(id, caller);
  }

  /** Manual repair for stuck ratings (organizer/admin only). */
  @Post(':id/ratings/retry')
  async retryRatings(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<{ ranked: number; ratingsApplied: boolean; ratingStatus: string }> {
    const caller = requireArea(callerOf(user), 'contests');
    return this.contests.retryRatings(id, caller);
  }
}
