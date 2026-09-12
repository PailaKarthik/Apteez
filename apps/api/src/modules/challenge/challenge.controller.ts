import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { challengeHistoryQuerySchema, type ChallengeHistoryQuery } from '@apteez/validation';
import type {
  ChallengeHistoryEntryDto,
  ChallengeResultDto,
  ChallengeStateDto,
  CursorPage,
} from '@apteez/types';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { OptionalAuth } from '../../common/decorators/auth.decorator';
import { AuthRequiredError } from '../auth/auth.errors';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ChallengeService } from './challenge.service';

/**
 * Read-only REST surface for challenges. Matchmaking, answering and leaving
 * happen over the socket; these endpoints rehydrate state, fetch the finalized
 * result and page the caller's history.
 */
@Controller('challenges')
export class ChallengeController {
  constructor(private readonly challenges: ChallengeService) {}

  @OptionalAuth()
  @Get('domains')
  async domains(): Promise<
    Array<{ slug: string; name: string; icon: string | null; problemCount: number }>
  > {
    return this.challenges.listDomains();
  }

  @Get()
  async active(@CurrentUser() user?: RequestUser): Promise<ChallengeStateDto | null> {
    if (!user) {
      throw new AuthRequiredError('Sign in to view your challenges.');
    }
    return this.challenges.activeChallenge(user.id);
  }

  @Get('history')
  async history(
    @Query(new ZodValidationPipe(challengeHistoryQuerySchema)) query: ChallengeHistoryQuery,
    @CurrentUser() user?: RequestUser,
  ): Promise<CursorPage<ChallengeHistoryEntryDto>> {
    if (!user) {
      throw new AuthRequiredError('Sign in to view your challenge history.');
    }
    return this.challenges.history(user.id, query);
  }

  @Get(':id')
  async state(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<ChallengeStateDto> {
    if (!user) {
      throw new AuthRequiredError('Sign in to view this challenge.');
    }
    return this.challenges.getState(id, user.id);
  }

  @Get(':id/result')
  async result(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<ChallengeResultDto> {
    if (!user) {
      throw new AuthRequiredError('Sign in to view this result.');
    }
    return this.challenges.buildResult(id, user.id);
  }
}
