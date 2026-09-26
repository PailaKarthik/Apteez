import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { feedbackSubmitSchema, type FeedbackSubmitInput } from '@apteez/validation';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { OptionalAuth } from '../../common/decorators/auth.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthRequiredError } from '../auth/auth.errors';
import { FeedbackService } from './feedback.service';

/**
 * Public feedback intake. Anonymous filing is allowed (userId stays null);
 * per-IP throttling keeps the intake from becoming a spam vector. Staff
 * triage lives under /admin/feedback.
 */
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @OptionalAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  async submit(
    @Body(new ZodValidationPipe(feedbackSubmitSchema)) body: FeedbackSubmitInput,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.feedback.submit(user?.id, body);
  }

  @Get('mine')
  async mine(@CurrentUser() user?: RequestUser) {
    if (!user) {
      throw new AuthRequiredError('Sign in to view your feedback.');
    }
    return this.feedback.mine(user.id);
  }
}
