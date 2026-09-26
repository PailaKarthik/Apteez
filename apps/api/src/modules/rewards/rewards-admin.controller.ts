import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  adminAchievementUpdateSchema,
  adminPointsAdjustSchema,
  adminRedemptionStatusSchema,
  adminRewardPatchSchema,
  adminRewardRuleCreateSchema,
  adminRewardRuleUpdateSchema,
  adminRewardStockSchema,
  adminRewardUpsertSchema,
  pointsHistoryQuerySchema,
  redemptionListQuerySchema,
  type AdminAchievementUpdateInput,
  type AdminPointsAdjustInput,
  type AdminRedemptionStatusInput,
  type AdminRewardPatchInput,
  type AdminRewardRuleCreateInput,
  type AdminRewardRuleUpdateInput,
  type AdminRewardStockInput,
  type AdminRewardUpsertInput,
  type PointsHistoryQuery,
  type RedemptionListQuery,
} from '@apteez/validation';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { callerOf, requireArea } from '../admin/admin-access';
import { PointsService } from './points.service';
import { RewardsService } from './rewards.service';

/**
 * Central admin-access policy (rewards area) instead of a local role check,
 * so reward staff gates stay consistent with every other admin surface. The
 * seeded admin role holds manage:rewards; super_admin/manage:platform bypass.
 */
function requireAdmin(user?: RequestUser): { id: string } {
  return requireArea(callerOf(user), 'rewards');
}

/** Admin reward management. Every mutation is audited via ledger metadata. */
@Controller('admin')
export class RewardsAdminController {
  constructor(
    private readonly points: PointsService,
    private readonly rewards: RewardsService,
  ) {}

  @Get('rewards')
  async listRewards(@CurrentUser() user?: RequestUser) {
    requireAdmin(user);
    return {
      items: await this.rewards.adminListRewards(),
    };
  }

  @Post('rewards')
  async createReward(
    @Body(new ZodValidationPipe(adminRewardUpsertSchema)) body: AdminRewardUpsertInput,
    @CurrentUser() user?: RequestUser,
  ) {
    requireAdmin(user);
    return this.rewards.adminCreate(body);
  }

  @Patch('rewards/:id')
  async updateReward(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(adminRewardPatchSchema)) body: AdminRewardPatchInput,
    @CurrentUser() user?: RequestUser,
  ) {
    requireAdmin(user);
    return this.rewards.adminUpdate(id, body);
  }

  // ─── Earning rules (dynamic triggers) ───

  @Get('reward-rules')
  async listRules(@CurrentUser() user?: RequestUser) {
    requireAdmin(user);
    return { items: await this.rewards.adminListRules() };
  }

  @Post('reward-rules')
  async createRule(
    @Body(new ZodValidationPipe(adminRewardRuleCreateSchema)) body: AdminRewardRuleCreateInput,
    @CurrentUser() user?: RequestUser,
  ) {
    requireAdmin(user);
    return this.rewards.adminRuleCreate(body);
  }

  @Patch('reward-rules/:id')
  async updateRule(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(adminRewardRuleUpdateSchema)) body: AdminRewardRuleUpdateInput,
    @CurrentUser() user?: RequestUser,
  ) {
    requireAdmin(user);
    return this.rewards.adminRuleUpdate(id, body);
  }

  // ─── Achievements (display + payout; unlock logic stays code-driven) ───

  @Get('achievements')
  async listAchievements(@CurrentUser() user?: RequestUser) {
    requireAdmin(user);
    return { items: await this.rewards.adminListAchievements() };
  }

  @Patch('achievements/:id')
  async updateAchievement(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(adminAchievementUpdateSchema)) body: AdminAchievementUpdateInput,
    @CurrentUser() user?: RequestUser,
  ) {
    requireAdmin(user);
    return this.rewards.adminAchievementUpdate(id, body);
  }

  @Patch('rewards/:id/stock')
  async setStock(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(adminRewardStockSchema)) body: AdminRewardStockInput,
    @CurrentUser() user?: RequestUser,
  ) {
    requireAdmin(user);
    return this.rewards.adminSetStock(id, body.stockQuantity);
  }

  @Get('rewards/redemptions')
  async redemptions(
    @Query(new ZodValidationPipe(redemptionListQuerySchema)) query: RedemptionListQuery,
    @CurrentUser() user?: RequestUser,
  ) {
    requireAdmin(user);
    return this.rewards.adminRedemptions(query);
  }

  @Patch('reward-redemptions/:id')
  async transition(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(adminRedemptionStatusSchema)) body: AdminRedemptionStatusInput,
    @CurrentUser() user?: RequestUser,
  ) {
    requireAdmin(user);
    return this.rewards.adminTransition(id, body.status);
  }

  @Get('rewards/suspicious')
  async suspicious(@CurrentUser() user?: RequestUser) {
    requireAdmin(user);
    return { items: await this.rewards.suspicious() };
  }

  @Post('users/:id/points/adjust')
  async adjust(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(adminPointsAdjustSchema)) body: AdminPointsAdjustInput,
    @CurrentUser() user?: RequestUser,
  ) {
    const admin = requireAdmin(user);
    return this.points.adjust({
      userId: id,
      amount: body.amount,
      reason: body.reason,
      adminId: admin.id,
    });
  }

  @Get('users/:id/points/history')
  async userHistory(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query(new ZodValidationPipe(pointsHistoryQuerySchema)) query: PointsHistoryQuery,
    @CurrentUser() user?: RequestUser,
  ) {
    requireAdmin(user);
    return this.points.history(id, query);
  }

  @Get('users/:id/points/verify')
  async verify(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ) {
    requireAdmin(user);
    return this.points.verify(id);
  }
}
