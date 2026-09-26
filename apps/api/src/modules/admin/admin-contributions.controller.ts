import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  adminContributionsQuerySchema,
  aiReviewPayloadSchema,
  contributionEditSchema,
  contributionReviewActionSchema,
  type AdminContributionsQuery,
  type AiReviewPayloadInput,
  type ContributionEditInput,
  type ContributionReviewActionInput,
} from '@apteez/validation';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminContributionsService } from './admin-contributions.service';
import { callerOf, requireArea } from './admin-access';

/**
 * Human contribution review. AI output is displayed as advisory only —
 * approval always requires a reviewer decision here.
 */
@Controller('admin/contributions')
export class AdminContributionsController {
  constructor(private readonly contributions: AdminContributionsService) {}

  @Get()
  async queue(
    @Query(new ZodValidationPipe(adminContributionsQuerySchema)) query: AdminContributionsQuery,
    @CurrentUser() user?: RequestUser,
  ) {
    requireArea(callerOf(user), 'contributions');
    return this.contributions.queue(query);
  }

  @Get(':id')
  async detail(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ) {
    requireArea(callerOf(user), 'contributions');
    return this.contributions.detail(id);
  }

  @Post(':id/pickup')
  async pickup(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ) {
    const caller = requireArea(callerOf(user), 'contributions');
    return this.contributions.pickup(id, caller);
  }

  /** Reviewer modifications on a pending contribution (stays in the queue). */
  @Patch(':id')
  async updateForReview(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(contributionEditSchema)) body: ContributionEditInput,
    @CurrentUser() user?: RequestUser,
    @Ip() ip?: string,
  ) {
    const caller = requireArea(callerOf(user), 'contributions');
    return this.contributions.updateForReview(id, body, caller, ip);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post(':id/approve')
  async approve(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(contributionReviewActionSchema))
    body: ContributionReviewActionInput,
    @CurrentUser() user?: RequestUser,
    @Ip() ip?: string,
  ) {
    // Publishing canonical content needs the content permission on top of review.
    const caller = requireArea(requireArea(callerOf(user), 'contributions'), 'content');
    return this.contributions.approve(id, body, caller, ip);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post(':id/reject')
  async reject(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(contributionReviewActionSchema))
    body: ContributionReviewActionInput,
    @CurrentUser() user?: RequestUser,
    @Ip() ip?: string,
  ) {
    const caller = requireArea(callerOf(user), 'contributions');
    return this.contributions.reject(id, body, caller, ip);
  }

  @Post(':id/request-changes')
  async requestChanges(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(contributionReviewActionSchema))
    body: ContributionReviewActionInput,
    @CurrentUser() user?: RequestUser,
    @Ip() ip?: string,
  ) {
    const caller = requireArea(callerOf(user), 'contributions');
    return this.contributions.requestChanges(id, body, caller, ip);
  }

  @Post(':id/analyze')
  async analyze(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ) {
    const caller = requireArea(callerOf(user), 'contributions');
    return this.contributions.analyze(id, caller);
  }

  @Post(':id/ai-review')
  async storeAiReview(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(aiReviewPayloadSchema)) body: AiReviewPayloadInput,
    @CurrentUser() user?: RequestUser,
  ) {
    // Advisory storage only: this endpoint cannot change contribution status.
    const caller = requireArea(callerOf(user), 'contributions');
    return this.contributions.storeAiReview(id, body, caller);
  }
}
