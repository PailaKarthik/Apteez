import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { aiFeedbackSubmitSchema, type AiFeedbackSubmitInput } from '@apteez/validation';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { FeatureFlagsService } from '../../config/feature-flags';
import { AuthRequiredError } from '../auth/auth.errors';
import { PerformanceCoachService } from './performance-coach.service';
import { AiQualityService } from './ai-quality.service';
import { AiUsageTrackerService } from './ai-usage-tracker.service';
import { callerOf, requireArea } from '../admin/admin-access';

function requireCaller(user?: RequestUser): { id: string } {
  if (!user) {
    throw new AuthRequiredError('Sign in to use the Performance Coach.');
  }
  return { id: user.id };
}

/**
 * AI application-layer routes. Coaching is per-user budgeted and falls back
 * to deterministic summaries; usage telemetry is admin-visible. When the
 * AI_PERFORMANCE_COACH flag is off, coaching still responds — with the
 * deterministic summary only — so the profile surface never depends on AI.
 */
@Controller('ai')
export class AiController {
  constructor(
    private readonly coach: PerformanceCoachService,
    private readonly usage: AiUsageTrackerService,
    private readonly flags: FeatureFlagsService,
    private readonly quality: AiQualityService,
  ) {}

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('coach')
  async coaching(@CurrentUser() user?: RequestUser) {
    const caller = requireCaller(user);
    const llmAllowed = this.flags.isEnabled('AI_PERFORMANCE_COACH', { userId: caller.id });
    return this.coach.coach(caller.id, undefined, { deterministicOnly: !llmAllowed });
  }

  /**
   * Quality signals (helpful/not helpful, relevant/not relevant). Advisory
   * evaluation signals only — never ground truth, never applied
   * automatically. Authenticated + throttled against ballot-stuffing.
   */
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('feedback')
  async feedback(
    @Body(new ZodValidationPipe(aiFeedbackSubmitSchema)) body: AiFeedbackSubmitInput,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.quality.recordFeedback(requireCaller(user).id, body);
  }

  @Get('usage')
  async usageSummary(@CurrentUser() user?: RequestUser) {
    requireArea(callerOf(user), 'analytics');
    return { items: await this.usage.summary(7) };
  }
}
