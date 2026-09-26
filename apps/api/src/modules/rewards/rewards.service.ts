import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import type {
  AchievementAdminDto,
  RedemptionDto,
  RewardDto,
  RewardRuleAdminDto,
  SuspiciousFlagDto,
} from '@apteez/types';
import type {
  AdminAchievementUpdateInput,
  AdminRewardRuleCreateInput,
  AdminRewardRuleUpdateInput,
  RedemptionListQuery,
  RewardCatalogQuery,
} from '@apteez/validation';
import { FeatureFlagsService } from '../../config/feature-flags';
import { EventQueueService } from '../../queue/event-queue.service';
import { StorageService } from '../../storage/storage.service';
import { PointsService, type LedgerTx } from './points.service';
import { AnalyticsService } from '../analytics/analytics.service';
import {
  InsufficientPointsError,
  RedemptionNotFoundError,
  RedemptionStateError,
  RewardNotAvailableError,
} from './rewards.errors';

const CATALOG_CACHE_TTL_MS = 60_000;

type RedemptionRow = {
  id: string;
  userId: string;
  rewardId: string;
  pointsCost: number;
  status: string;
  createdAt: Date;
  processedAt: Date | null;
  cancelledAt: Date | null;
  reward: { name: string };
};

/** Admin-driven status transitions. Refund+restock happen only on the paths marked so. */
const ADMIN_TRANSITIONS: Record<string, { to: string[]; refund: boolean }> = {
  PENDING: { to: ['PROCESSING', 'CANCELLED', 'FAILED'], refund: false },
  PROCESSING: { to: ['FULFILLED', 'CANCELLED', 'FAILED'], refund: false },
  FULFILLED: { to: [], refund: false },
  CANCELLED: { to: [], refund: false },
  FAILED: { to: [], refund: false },
  REFUNDED: { to: [], refund: false },
};

/**
 * Catalog reads (short-TTL cached, never authoritative) and transactional
 * redemptions. Every spend flows through PointsService ledger helpers inside
 * the SAME database transaction as the redemption row and stock decrement,
 * so points, inventory and redemption state can never diverge.
 */
@Injectable()
export class RewardsService {
  private catalogCache: { at: number; rows: RewardRow[] } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly points: PointsService,
    private readonly storage: StorageService,
    private readonly events: EventQueueService,
    private readonly analytics: AnalyticsService,
    private readonly flags: FeatureFlagsService,
  ) {}

  // ─── Catalog (cached reads; stock/balance revalidated at redeem time) ───

  async catalog(
    userId: string | undefined,
    query: RewardCatalogQuery,
  ): Promise<{
    items: RewardDto[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> {
    const rows = await this.activeRewards();
    const filtered = query.category
      ? rows.filter((row) => row.category.toLowerCase() === query.category!.toLowerCase())
      : rows;
    const total = filtered.length;
    const page =
      rows.length === 0
        ? []
        : filtered.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
    const balance = userId ? await this.balanceOf(userId) : 0;
    return {
      items: await Promise.all(page.map((row) => this.toRewardDto(row, balance))),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async rewardDetail(
    rewardId: string,
    userId: string | undefined,
    admin = false,
  ): Promise<RewardDto> {
    const row = await this.prisma.reward.findUnique({ where: { id: rewardId } });
    if (!row || (!row.isActive && !admin)) {
      throw new RewardNotAvailableError();
    }
    return this.toRewardDto(row, userId ? await this.balanceOf(userId) : 0);
  }

  /** Test/admin hook: drop the cached catalog so reads see fresh rows. */
  clearCatalogCache(): void {
    this.catalogCache = null;
  }

  /** All rewards for admin management (active and inactive). */
  async adminListRewards(): Promise<RewardDto[]> {
    const rows = await this.prisma.reward.findMany({ orderBy: [{ createdAt: 'desc' }] });
    return Promise.all(rows.map((row) => this.toRewardDto(row, 0)));
  }

  /** Active earning rules, served from the database — never duplicated in UI. */
  async listRules(): Promise<
    Array<{
      key: string;
      name: string;
      description: string | null;
      points: number;
      category: string;
      dailyCap: number | null;
      maxPerUser: number | null;
      cooldownSeconds: number | null;
    }>
  > {
    const now = new Date();
    const rows = await this.prisma.rewardRule.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validTo: null }, { validTo: { gte: now } }] },
        ],
      },
      orderBy: [{ category: 'asc' }, { points: 'asc' }],
      select: {
        key: true,
        name: true,
        description: true,
        points: true,
        category: true,
        dailyCap: true,
        maxPerUser: true,
        cooldownSeconds: true,
      },
    });
    return rows;
  }

  // ─── Redemption (fully transactional) ───

  async redeem(userId: string, rewardId: string, idempotencyKey?: string): Promise<RedemptionDto> {
    // Product kill-switch: catalog and ledger reads keep working while
    // redemption is closed server-side. Checked before any balance read so a
    // disabled flag never leaks spendable-state timing.
    this.flags.requireEnabled('REWARDS_REDEMPTION', { userId });
    const key = idempotencyKey?.trim() || null;
    const { redemption, fresh } = await this.prisma.$transaction(async (tx) => {
      if (key) {
        const existing = await tx.rewardRedemption.findFirst({
          where: { userId, idempotencyKey: key },
          include: { reward: { select: { name: true } } },
        });
        if (existing) {
          return { redemption: this.toRedemptionDto(existing as RedemptionRow), fresh: false };
        }
      }
      const reward = await tx.reward.findUnique({ where: { id: rewardId } });
      if (!reward || !reward.isActive) {
        throw new RewardNotAvailableError('This reward is not available right now.');
      }
      const balance = await this.points.ensureMirror(tx as LedgerTx, userId);
      if (balance < reward.pointsCost) {
        throw new InsufficientPointsError();
      }
      if (reward.stockQuantity !== null) {
        // Atomic guard: exactly one concurrent winner decrements the last unit.
        const decremented = await tx.reward.updateMany({
          where: { id: reward.id, stockQuantity: { gte: 1 } },
          data: { stockQuantity: { decrement: 1 } },
        });
        if (decremented.count === 0) {
          throw new RewardNotAvailableError('This reward is out of stock.');
        }
      }
      const created = await tx.rewardRedemption.create({
        data: {
          userId,
          rewardId: reward.id,
          pointsCost: reward.pointsCost,
          status: 'PENDING',
          idempotencyKey: key,
        },
        include: { reward: { select: { name: true } } },
      });
      await this.points.appendEntry(tx as LedgerTx, {
        userId,
        amount: -reward.pointsCost,
        type: 'SPEND',
        reason: 'reward:redemption',
        referenceId: created.id,
        sourceType: 'redemption',
        sourceId: created.id,
        description: `Redeemed ${reward.name}`,
        metadata: { rewardId: reward.id },
      });
      return { redemption: this.toRedemptionDto(created as RedemptionRow), fresh: true };
    });
    this.events
      .notifyUser({
        userId,
        type: 'REWARD_REDEEMED',
        title: `Reward redeemed: ${redemption.rewardName}`,
        body: `${redemption.pointsCost} points · status ${redemption.status}`,
      })
      .catch(() => undefined);
    // Fresh redemptions only: idempotent replays return the existing row.
    if (fresh) {
      // Stock changed: drop the cached catalog so counts stay truthful.
      this.clearCatalogCache();
      void this.analytics.record('rewards.redeemed', {
        userId,
        metadata: { rewardId, pointsCost: redemption.pointsCost },
      });
    }
    return redemption;
  }

  async myRedemptions(
    userId: string,
    query: RedemptionListQuery,
  ): Promise<{
    items: RedemptionDto[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> {
    const where = { userId, ...(query.status ? { status: query.status } : {}) };
    const [total, rows] = await Promise.all([
      this.prisma.rewardRedemption.count({ where }),
      this.prisma.rewardRedemption.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { reward: { select: { name: true } } },
      }),
    ]);
    return {
      items: rows.map((row) => this.toRedemptionDto(row as RedemptionRow)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async myRedemption(userId: string, id: string): Promise<RedemptionDto> {
    const row = await this.prisma.rewardRedemption.findFirst({
      where: { id, userId },
      include: { reward: { select: { name: true } } },
    });
    if (!row) {
      throw new RedemptionNotFoundError();
    }
    return this.toRedemptionDto(row as RedemptionRow);
  }

  /** Owner cancellation of a PENDING redemption: refund + restock atomically. */
  async cancelMine(userId: string, id: string): Promise<RedemptionDto> {
    const redemption = await this.prisma.$transaction(async (tx) => {
      const row = await tx.rewardRedemption.findFirst({ where: { id, userId } });
      if (!row) {
        throw new RedemptionNotFoundError();
      }
      if (row.status !== 'PENDING') {
        throw new RedemptionStateError('Only pending redemptions can be cancelled.');
      }
      const updated = await tx.rewardRedemption.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
        include: { reward: { select: { name: true } } },
      });
      await this.points.appendEntry(tx as LedgerTx, {
        userId,
        amount: row.pointsCost,
        type: 'REFUND',
        reason: 'reward:refund',
        referenceId: row.id,
        sourceType: 'redemption',
        sourceId: row.id,
        description: `Refund for cancelled redemption`,
      });
      await tx.reward.updateMany({
        where: { id: row.rewardId, stockQuantity: { not: null } },
        data: { stockQuantity: { increment: 1 } },
      });
      return this.toRedemptionDto(updated as RedemptionRow);
    });
    this.events
      .notifyUser({
        userId,
        type: 'REWARD_REFUNDED',
        title: `Redemption cancelled: ${redemption.rewardName}`,
        body: `${redemption.pointsCost} points refunded.`,
      })
      .catch(() => undefined);
    return redemption;
  }

  // ─── Admin ───

  async adminCreate(input: {
    name: string;
    description?: string;
    category: string;
    pointsCost: number;
    imageKey?: string;
    stockQuantity?: number | null;
    isActive?: boolean;
  }): Promise<RewardDto> {
    const created = await this.prisma.reward.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        category: input.category,
        pointsCost: input.pointsCost,
        imageKey: input.imageKey ?? null,
        stockQuantity: input.stockQuantity ?? null,
        isActive: input.isActive ?? true,
      },
    });
    this.clearCatalogCache();
    return this.toRewardDto(created, 0);
  }

  async adminUpdate(
    id: string,
    input: Partial<{
      name: string;
      description?: string;
      category: string;
      pointsCost: number;
      imageKey?: string;
      stockQuantity: number | null;
      isActive: boolean;
    }>,
  ): Promise<RewardDto> {
    const updated = await this.prisma.reward
      .update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.pointsCost !== undefined ? { pointsCost: input.pointsCost } : {}),
          ...(input.imageKey !== undefined ? { imageKey: input.imageKey } : {}),
          ...(input.stockQuantity !== undefined ? { stockQuantity: input.stockQuantity } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      })
      .catch(() => {
        throw new RewardNotAvailableError('Reward not found.');
      });
    this.clearCatalogCache();
    return this.toRewardDto(updated, 0);
  }

  async adminSetStock(id: string, stockQuantity: number | null): Promise<RewardDto> {
    if (stockQuantity !== null && stockQuantity < 0) {
      throw new RewardNotAvailableError('Stock cannot be negative.');
    }
    return this.adminUpdate(id, { stockQuantity });
  }

  // ─── Admin: earning rules (dynamic triggers) ───

  /** Every rule, active and inactive, newest last for stable admin review. */
  async adminListRules(): Promise<RewardRuleAdminDto[]> {
    const rows = await this.prisma.rewardRule.findMany({ orderBy: [{ key: 'asc' }] });
    return rows.map((row) => this.toRuleAdminDto(row));
  }

  async adminRuleCreate(input: AdminRewardRuleCreateInput): Promise<RewardRuleAdminDto> {
    const existing = await this.prisma.rewardRule.findUnique({ where: { key: input.key } });
    if (existing) {
      throw new RewardNotAvailableError(`A rule with key "${input.key}" already exists.`);
    }
    const created = await this.prisma.rewardRule.create({
      data: {
        key: input.key,
        name: input.name,
        description: input.description ?? null,
        trigger: input.trigger.trim().toLowerCase(),
        points: input.points,
        category: input.category,
        dailyCap: input.dailyCap ?? null,
        maxPerUser: input.maxPerUser ?? null,
        cooldownSeconds: input.cooldownSeconds ?? null,
        validFrom: input.validFrom ? new Date(input.validFrom) : null,
        validTo: input.validTo ? new Date(input.validTo) : null,
        isActive: input.isActive ?? true,
      },
    });
    this.points.clearRuleCache();
    return this.toRuleAdminDto(created);
  }

  async adminRuleUpdate(
    id: string,
    input: AdminRewardRuleUpdateInput,
  ): Promise<RewardRuleAdminDto> {
    const updated = await this.prisma.rewardRule
      .update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.trigger !== undefined ? { trigger: input.trigger.trim().toLowerCase() } : {}),
          ...(input.points !== undefined ? { points: input.points } : {}),
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.dailyCap !== undefined ? { dailyCap: input.dailyCap } : {}),
          ...(input.maxPerUser !== undefined ? { maxPerUser: input.maxPerUser } : {}),
          ...(input.cooldownSeconds !== undefined
            ? { cooldownSeconds: input.cooldownSeconds }
            : {}),
          ...(input.validFrom !== undefined
            ? { validFrom: input.validFrom ? new Date(input.validFrom) : null }
            : {}),
          ...(input.validTo !== undefined
            ? { validTo: input.validTo ? new Date(input.validTo) : null }
            : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      })
      .catch(() => {
        throw new RewardNotAvailableError('Reward rule not found.');
      });
    this.points.clearRuleCache();
    return this.toRuleAdminDto(updated);
  }

  // ─── Admin: achievements (display + payout; unlock logic stays in code) ───

  async adminListAchievements(): Promise<AchievementAdminDto[]> {
    const [rows, counts] = await Promise.all([
      this.prisma.achievement.findMany({ orderBy: [{ key: 'asc' }] }),
      this.prisma.userAchievement.groupBy({ by: ['achievementId'], _count: { id: true } }),
    ]);
    const countById = new Map(counts.map((row) => [row.achievementId, row._count.id]));
    return rows.map((row) => ({
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      category: row.category,
      points: row.points,
      isActive: row.isActive,
      unlockCount: countById.get(row.id) ?? 0,
    }));
  }

  async adminAchievementUpdate(
    id: string,
    input: AdminAchievementUpdateInput,
  ): Promise<AchievementAdminDto> {
    const updated = await this.prisma.achievement
      .update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.points !== undefined ? { points: input.points } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      })
      .catch(() => {
        throw new RewardNotAvailableError('Achievement not found.');
      });
    const unlockCount = await this.prisma.userAchievement.count({
      where: { achievementId: id },
    });
    return {
      id: updated.id,
      key: updated.key,
      name: updated.name,
      description: updated.description,
      category: updated.category,
      points: updated.points,
      isActive: updated.isActive,
      unlockCount,
    };
  }

  private toRuleAdminDto(row: {
    id: string;
    key: string;
    name: string;
    description: string | null;
    points: number;
    trigger: string;
    category: string;
    dailyCap: number | null;
    maxPerUser: number | null;
    cooldownSeconds: number | null;
    validFrom: Date | null;
    validTo: Date | null;
    isActive: boolean;
    updatedAt: Date;
  }): RewardRuleAdminDto {
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      points: row.points,
      trigger: row.trigger,
      category: row.category,
      dailyCap: row.dailyCap,
      maxPerUser: row.maxPerUser,
      cooldownSeconds: row.cooldownSeconds,
      validFrom: row.validFrom?.toISOString() ?? null,
      validTo: row.validTo?.toISOString() ?? null,
      isActive: row.isActive,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async adminRedemptions(query: RedemptionListQuery): Promise<{
    items: Array<RedemptionDto & { userId: string }>;
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> {
    const where = query.status ? { status: query.status } : {};
    const [total, rows] = await Promise.all([
      this.prisma.rewardRedemption.count({ where }),
      this.prisma.rewardRedemption.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { reward: { select: { name: true } } },
      }),
    ]);
    return {
      items: rows.map((row) => ({
        ...this.toRedemptionDto(row as RedemptionRow),
        userId: row.userId,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  /** Admin status change. CANCELLED/FAILED from a charged state refunds + restocks. */
  async adminTransition(
    id: string,
    to: 'PROCESSING' | 'FULFILLED' | 'CANCELLED' | 'FAILED',
  ): Promise<RedemptionDto> {
    const redemption = await this.prisma.$transaction(async (tx) => {
      const row = await tx.rewardRedemption.findUnique({ where: { id } });
      if (!row) {
        throw new RedemptionNotFoundError();
      }
      const allowed = ADMIN_TRANSITIONS[row.status];
      if (!allowed || !allowed.to.includes(to)) {
        throw new RedemptionStateError(`Cannot move redemption from ${row.status} to ${to}.`);
      }
      const now = new Date();
      const updated = await tx.rewardRedemption.update({
        where: { id },
        data: {
          status: to,
          ...(to === 'FULFILLED' || to === 'PROCESSING' ? { processedAt: now } : {}),
          ...(to === 'CANCELLED' || to === 'FAILED' ? { cancelledAt: now } : {}),
        },
        include: { reward: { select: { name: true } } },
      });
      if (to === 'CANCELLED' || to === 'FAILED') {
        await this.points.appendEntry(tx as LedgerTx, {
          userId: row.userId,
          amount: row.pointsCost,
          type: 'REFUND',
          reason: 'reward:refund',
          referenceId: row.id,
          sourceType: 'redemption',
          sourceId: row.id,
          description: `Refund for ${to.toLowerCase()} redemption`,
          metadata: { admin: true },
        });
        await tx.reward.updateMany({
          where: { id: row.rewardId, stockQuantity: { not: null } },
          data: { stockQuantity: { increment: 1 } },
        });
      }
      return this.toRedemptionDto(updated as RedemptionRow);
    });
    // Restocks on CANCELLED/FAILED change catalog counts.
    if (to === 'CANCELLED' || to === 'FAILED') {
      this.clearCatalogCache();
    }
    const owner = await this.prisma.rewardRedemption.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (owner) {
      this.events
        .notifyUser({
          userId: owner.userId,
          type: to === 'FULFILLED' ? 'REWARD_REDEEMED' : 'REWARD_REFUNDED',
          title: `Redemption ${to.toLowerCase()}: ${redemption.rewardName}`,
        })
        .catch(() => undefined);
    }
    return redemption;
  }

  /** Flag-only abuse signals for admin review. Never auto-bans. */
  async suspicious(limit = 50): Promise<SuspiciousFlagDto[]> {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const [heavyEarners, frequentEarners, failedBursts] = await Promise.all([
      this.prisma.pointTransaction.groupBy({
        by: ['userId'],
        where: { type: 'EARN', createdAt: { gte: startOfDay } },
        _sum: { amount: true },
        having: { amount: { _sum: { gt: 2000 } } },
        orderBy: { _sum: { amount: 'desc' } },
        take: limit,
      }),
      this.prisma.pointTransaction.groupBy({
        by: ['userId'],
        where: { type: 'EARN', createdAt: { gte: startOfDay } },
        _count: { _all: true },
        having: { id: { _count: { gt: 50 } } },
        orderBy: { _count: { id: 'desc' } },
        take: limit,
      }),
      this.prisma.rewardRedemption.groupBy({
        by: ['userId'],
        where: { status: 'FAILED', createdAt: { gte: startOfDay } },
        _count: { _all: true },
        having: { id: { _count: { gt: 5 } } },
        orderBy: { _count: { id: 'desc' } },
        take: limit,
      }),
    ]);
    const userIds = [
      ...new Set([
        ...heavyEarners.map((row) => row.userId),
        ...frequentEarners.map((row) => row.userId),
        ...failedBursts.map((row) => row.userId),
      ]),
    ];
    if (userIds.length === 0) {
      return [];
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, displayName: true },
    });
    const byId = new Map(users.map((user) => [user.id, user]));
    const flags: SuspiciousFlagDto[] = [];
    for (const row of heavyEarners) {
      const user = byId.get(row.userId);
      if (user) {
        flags.push({
          userId: user.id,
          username: user.username,
          displayName: user.displayName,
          signal: 'high-daily-points',
          detail: `${row._sum.amount ?? 0} points earned today`,
          pointsToday: row._sum.amount ?? 0,
        });
      }
    }
    for (const row of frequentEarners) {
      const user = byId.get(row.userId);
      const count = (row._count as unknown as { _all: number })._all;
      if (user) {
        flags.push({
          userId: user.id,
          username: user.username,
          displayName: user.displayName,
          signal: 'high-frequency',
          detail: `${count} earning transactions today`,
          pointsToday: 0,
        });
      }
    }
    for (const row of failedBursts) {
      const user = byId.get(row.userId);
      const count = (row._count as unknown as { _all: number })._all;
      if (user) {
        flags.push({
          userId: user.id,
          username: user.username,
          displayName: user.displayName,
          signal: 'redemption-failures',
          detail: `${count} failed redemptions today`,
          pointsToday: 0,
        });
      }
    }
    return flags.slice(0, limit);
  }

  private async activeRewards(): Promise<RewardRow[]> {
    const now = Date.now();
    if (!this.catalogCache || now - this.catalogCache.at > CATALOG_CACHE_TTL_MS) {
      const rows = await this.prisma.reward.findMany({
        where: { isActive: true },
        orderBy: [{ pointsCost: 'asc' }],
      });
      this.catalogCache = { at: now, rows };
    }
    return this.catalogCache.rows;
  }

  private async balanceOf(userId: string): Promise<number> {
    const mirror = await this.prisma.userPoints.findUnique({
      where: { userId },
      select: { balance: true },
    });
    return mirror?.balance ?? 0;
  }

  private async toRewardDto(row: RewardRow, balance: number): Promise<RewardDto> {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      pointsCost: row.pointsCost,
      imageUrl: row.imageKey ? await this.storage.getDownloadUrl(row.imageKey) : null,
      stockQuantity: row.stockQuantity,
      inStock: row.stockQuantity === null || row.stockQuantity > 0,
      isActive: row.isActive,
      affordable: balance >= row.pointsCost,
    };
  }

  private toRedemptionDto(row: RedemptionRow): RedemptionDto {
    return {
      id: row.id,
      rewardId: row.rewardId,
      rewardName: row.reward.name,
      pointsCost: row.pointsCost,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      processedAt: row.processedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
    };
  }
}

type RewardRow = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  pointsCost: number;
  imageKey: string | null;
  stockQuantity: number | null;
  isActive: boolean;
};
