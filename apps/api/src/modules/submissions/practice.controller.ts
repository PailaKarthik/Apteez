import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { submitAttemptSchema, type SubmitAttemptInput } from '@apteez/validation';
import type { AttemptDto, AttemptResultDto } from '@apteez/types';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { AuthRequiredError } from '../auth/auth.errors';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PracticeService } from './practice.service';

/**
 * Practice attempt endpoints. Authentication is mandatory — attempts are
 * owned, persisted and server-scored. The client supplies only the chosen
 * option (and an optional untrusted timing hint).
 */
@Controller('problems/:problemId/attempts')
export class PracticeController {
  constructor(private readonly practice: PracticeService) {}

  @Post()
  @Throttle({ practice: {} })
  async start(
    @Param('problemId', new ParseUUIDPipe({ version: '4' })) problemId: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<AttemptDto> {
    if (!user) {
      throw new AuthRequiredError('Sign in to practise problems.');
    }
    return this.practice.startAttempt(user.id, problemId);
  }

  @Post(':attemptId/submit')
  @Throttle({ practice: {} })
  @HttpCode(200)
  async submit(
    @Param('problemId', new ParseUUIDPipe({ version: '4' })) problemId: string,
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
    @Body(new ZodValidationPipe(submitAttemptSchema)) body: SubmitAttemptInput,
    @CurrentUser() user?: RequestUser,
  ): Promise<AttemptResultDto> {
    if (!user) {
      throw new AuthRequiredError('Sign in to submit answers.');
    }
    return this.practice.submitAttempt(user.id, problemId, attemptId, body);
  }

  @Post(':attemptId/abandon')
  @HttpCode(200)
  async abandon(
    @Param('problemId', new ParseUUIDPipe({ version: '4' })) problemId: string,
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<{ abandoned: true }> {
    if (!user) {
      throw new AuthRequiredError('Sign in to practise problems.');
    }
    await this.practice.abandonAttempt(user.id, problemId, attemptId);
    return { abandoned: true };
  }
}
