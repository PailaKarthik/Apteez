import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  pointsHistoryQuerySchema,
  redeemRewardSchema,
  redemptionListQuerySchema,
  rewardCatalogQuerySchema,
  type PointsHistoryQuery,
  type RedeemRewardInput,
  type RedemptionListQuery,
  type RewardCatalogQuery,
} from '@apteez/validation';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { OptionalAuth } from '../../common/decorators/auth.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthRequiredError } from '../auth/auth.errors';
import { PointsService } from './points.service';
import { RewardsService } from './rewards.service';

function requireCaller(user?: RequestUser): { id: string } {
  if (!user) {
    throw new AuthRequiredError('Sign in to manage rewards.');
  }
  return { id: user.id };
}

/** User-facing points, catalog and redemption surface. Amounts never come from clients. */
@Controller('rewards')
export class RewardsController {
  constructor(
    private readonly points: PointsService,
    private readonly rewards: RewardsService,
  ) {}

  @Get('points')
  async balance(@CurrentUser() user?: RequestUser) {
    return this.points.summary(requireCaller(user).id);
  }

  @Get('points/history')
  async history(
    @Query(new ZodValidationPipe(pointsHistoryQuerySchema)) query: PointsHistoryQuery,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.points.history(requireCaller(user).id, query);
  }

  @Get('rules')
  async rules() {
    return { items: await this.rewards.listRules() };
  }

  @OptionalAuth()
  @Get('catalog')
  async catalog(
    @Query(new ZodValidationPipe(rewardCatalogQuerySchema)) query: RewardCatalogQuery,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.rewards.catalog(user?.id, query);
  }

  @OptionalAuth()
  @Get('catalog/:id')
  async catalogDetail(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.rewards.rewardDetail(id, user?.id);
  }

  // Dedicated budget below the global default: redemptions move stock and
  // money-like balances, so finalization spam gets its own ceiling.
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('redeem')
  async redeem(
    @Body(new ZodValidationPipe(redeemRewardSchema)) body: RedeemRewardInput,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.rewards.redeem(requireCaller(user).id, body.rewardId, body.idempotencyKey);
  }

  @Get('redemptions')
  async redemptions(
    @Query(new ZodValidationPipe(redemptionListQuerySchema)) query: RedemptionListQuery,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.rewards.myRedemptions(requireCaller(user).id, query);
  }

  @Get('redemptions/:id')
  async redemption(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.rewards.myRedemption(requireCaller(user).id, id);
  }

  @Patch('redemptions/:id/cancel')
  async cancel(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.rewards.cancelMine(requireCaller(user).id, id);
  }
}
