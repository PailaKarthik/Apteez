import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ratingDomainQuerySchema,
  ratingHistoryQuerySchema,
  ratingLeaderboardQuerySchema,
  type RatingDomainQuery,
  type RatingHistoryQuery,
  type RatingLeaderboardQuery,
} from '@apteez/validation';
import type {
  CursorPage,
  RatingHistoryEntryDto,
  RatingLeaderboardEntryDto,
  RatingsOverviewDto,
} from '@apteez/types';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { OptionalAuth } from '../../common/decorators/auth.decorator';
import { AuthRequiredError } from '../auth/auth.errors';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RatingService } from './rating.service';
import { RatingHistoryService } from './rating-history.service';

/**
 * Read-only competitive rating surface. Ratings are only ever mutated by the
 * rating engine on challenge completion — there is deliberately no public
 * "update rating" endpoint.
 */
@Controller('ratings')
export class RatingController {
  constructor(
    private readonly ratings: RatingService,
    private readonly history: RatingHistoryService,
  ) {}

  @Get('me')
  async me(
    @Query(new ZodValidationPipe(ratingDomainQuerySchema)) query: RatingDomainQuery,
    @CurrentUser() user?: RequestUser,
  ): Promise<RatingsOverviewDto> {
    if (!user) {
      throw new AuthRequiredError('Sign in to view your ratings.');
    }
    return this.ratings.overview(user.id, query.domain);
  }

  @Get('history')
  async historyForUser(
    @Query(new ZodValidationPipe(ratingHistoryQuerySchema)) query: RatingHistoryQuery,
    @CurrentUser() user?: RequestUser,
  ): Promise<CursorPage<RatingHistoryEntryDto>> {
    if (!user) {
      throw new AuthRequiredError('Sign in to view your rating history.');
    }
    return this.history.page(user.id, query);
  }

  @OptionalAuth()
  @Get('leaderboard')
  async leaderboard(
    @Query(new ZodValidationPipe(ratingLeaderboardQuerySchema)) query: RatingLeaderboardQuery,
  ): Promise<RatingLeaderboardEntryDto[]> {
    return this.ratings.leaderboard(query.domain, query.institution, query.limit);
  }

  @OptionalAuth()
  @Get('users/:username')
  async byUsername(@Param('username') username: string): Promise<RatingsOverviewDto> {
    return this.ratings.overviewByUsername(username);
  }
}
