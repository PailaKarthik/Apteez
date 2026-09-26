import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import type { PointsHistoryItemDto, PointsSummaryDto } from '@apteez/types';
import type { PointsHistoryQuery } from '@apteez/validation';
import { EventQueueService } from '../../queue/event-queue.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { InsufficientPointsError, PointsRuleError } from './rewards.errors';

interface LedgerEntry {
  userId: string;
  amount: number;
  type: 'EARN' | 'SPEND' | 'ADJUST' | 'REVERSAL' | 'REFUND';
  reason: string;
  referenceId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface RuleAward {
  userId: string;
  ruleKey: string;
  sourceType: string;
  sourceId: string;
  metadata?: Record<string, unknown> | null;
}

interface TriggerAward {
  userId: string;
  /** Firing event, e.g. "problem-solve". Matches rule.trigger OR rule.key. */
  trigger: string;
  sourceType: string;
  sourceId: string;
  metadata?: Record<string, unknown> | null;
}

interface CachedRule {
  key: string;
  name: string;
  points: number;
  category: string;
  trigger: string;
  dailyCap: number | null;
  maxPerUser: number | null;
  cooldownSeconds: number | null;
  validFrom: Date | null;
  validTo: Date | null;
  isActive: boolean;
}

const RULE_CACHE_TTL_MS = 60_000;

/** Transaction client surface used by ledger appends (subset of PrismaService). */
export type LedgerTx = Pick<PrismaService, 'pointTransaction' | 'userPoints' | '$queryRaw'>;

/**
 * Sole writer of the point ledger and UserPoints mirror. Every mutation runs
 * inside one database transaction: row lock on the mirror → ledger append →
 * mirror sync. Amounts always resolve server-side (rules/achievements/catalog);
 * no API accepts a client-supplied amount. Retries are idempotent via
 * (reason, referenceId) lookups plus the partial unique index on
 * (userId, sourceType, sourceId, type).
 */
@Injectable()
export class PointsService {
  private ruleCache: { at: number; rules: CachedRule[] } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly events?: EventQueueService,
    @Optional() private readonly analytics?: AnalyticsService,
  ) {}

  /**
   * Legacy-compatible single award, idempotent on (reason, referenceId).
   * Used by achievement unlocks. New domain code should prefer awardTrigger.
   */
  async awardOnce(params: {
    userId: string;
    amount: number;
    reason: string;
    referenceId?: string | null;
    description?: string | null;
    sourceType?: string | null;
    sourceId?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<{ awarded: boolean; balance: number }> {
    this.assertSaneAmount(params.amount);
    const outcome = await this.prisma.$transaction(async (tx) => {
      if (params.referenceId) {
        const existing = await tx.pointTransaction.findFirst({
          where: { userId: params.userId, reason: params.reason, referenceId: params.referenceId },
          orderBy: { createdAt: 'desc' },
        });
        if (existing) {
          return { duplicate: true as const };
        }
      }
      try {
        const balance = await this.appendEntry(tx, {
          userId: params.userId,
          amount: params.amount,
          type: 'EARN',
          reason: params.reason,
          referenceId: params.referenceId ?? null,
          sourceType: params.sourceType ?? null,
          sourceId: params.sourceId ?? null,
          description: params.description ?? null,
          metadata: params.metadata ?? null,
        });
        return { duplicate: false as const, balance };
      } catch (error) {
        if (this.isUniqueViolation(error)) {
          return { duplicate: true as const };
        }
        throw error;
      }
    });
    if (outcome.duplicate) {
      return { awarded: false, balance: await this.balanceOf(params.userId) };
    }
    void this.notifyEarned(params.userId, params.amount, params.description ?? params.reason);
    return { awarded: true, balance: outcome.balance };
  }

  /**
   * Rule-driven award (legacy single-key entry): resolves the rule by key and
   * awards it. Unknown/inactive keys throw, preserving the old contract.
   */
  async awardRule(
    params: RuleAward,
  ): Promise<{ awarded: boolean; capped: boolean; balance: number }> {
    const rules = await this.activeRules();
    const rule = rules.find((candidate) => candidate.key === params.ruleKey);
    if (!rule) {
      throw new PointsRuleError(`Unknown or inactive reward rule: ${params.ruleKey}.`);
    }
    const states = await this.awardMany(params.userId, [rule], params);
    const awarded = states.includes('awarded');
    return {
      awarded,
      capped: !awarded && states.includes('capped'),
      balance: await this.balanceOf(params.userId),
    };
  }

  /**
   * Trigger-driven award: awards EVERY active in-window rule whose trigger
   * (or legacy key) matches. This is what makes admin-created rules work
   * with zero code changes — a rule with trigger "problem-solve" fires on
   * every solve. Unknown triggers are a silent no-op (best-effort economy).
   * Each rule keeps its own exactly-once guarantee via the reason-scoped
   * partial unique index, plus daily/lifetime/cooldown guards.
   */
  async awardTrigger(
    params: TriggerAward,
  ): Promise<{ awarded: boolean; awardedCount: number; balance: number }> {
    const now = new Date();
    const rules = (await this.activeRules()).filter(
      (rule) =>
        (rule.trigger === params.trigger || rule.key === params.trigger) &&
        (!rule.validFrom || rule.validFrom <= now) &&
        (!rule.validTo || rule.validTo >= now),
    );
    if (rules.length === 0) {
      return { awarded: false, awardedCount: 0, balance: await this.balanceOf(params.userId) };
    }
    const states = await this.awardMany(params.userId, rules, params);
    const awardedCount = states.filter((state) => state === 'awarded').length;
    return {
      awarded: awardedCount > 0,
      awardedCount,
      balance: await this.balanceOf(params.userId),
    };
  }

  /** Awards each rule in its own sequential transaction (pooler-safe). */
  private async awardMany(
    userId: string,
    rules: CachedRule[],
    params: { sourceType: string; sourceId: string; metadata?: Record<string, unknown> | null },
  ): Promise<Array<'awarded' | 'capped' | 'duplicate'>> {
    const states: Array<'awarded' | 'capped' | 'duplicate'> = [];
    for (const rule of rules) {
      const state = await this.awardOne(userId, rule, params);
      states.push(state);
      if (state === 'awarded') {
        void this.notifyEarned(userId, rule.points, rule.name);
        void this.analytics
          ?.record('rewards.points_earned', {
            userId,
            metadata: { rule: rule.key, amount: rule.points },
          })
          .catch(() => undefined);
      }
    }
    return states;
  }

  private async awardOne(
    userId: string,
    rule: CachedRule,
    params: { sourceType: string; sourceId: string; metadata?: Record<string, unknown> | null },
  ): Promise<'awarded' | 'capped' | 'duplicate'> {
    const reason = `rule:${rule.key}`;
    const outcome = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.pointTransaction.findFirst({
        where: {
          userId,
          reason,
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          type: 'EARN',
        },
      });
      if (existing) {
        return { state: 'duplicate' as const };
      }
      if (rule.dailyCap !== null) {
        const startOfDay = new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);
        const earnedToday = await tx.pointTransaction.count({
          where: { userId, reason, createdAt: { gte: startOfDay } },
        });
        if (earnedToday >= rule.dailyCap) {
          return { state: 'capped' as const };
        }
      }
      if (rule.maxPerUser !== null) {
        const earnedEver = await tx.pointTransaction.count({ where: { userId, reason } });
        if (earnedEver >= rule.maxPerUser) {
          return { state: 'capped' as const };
        }
      }
      if (rule.cooldownSeconds !== null) {
        const last = await tx.pointTransaction.findFirst({
          where: { userId, reason },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });
        if (last && Date.now() - last.createdAt.getTime() < rule.cooldownSeconds * 1000) {
          return { state: 'capped' as const };
        }
      }
      try {
        await this.appendEntry(tx, {
          userId,
          amount: rule.points,
          type: 'EARN',
          reason,
          referenceId: params.sourceId,
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          description: rule.name,
          metadata: params.metadata ?? null,
        });
        return { state: 'awarded' as const };
      } catch (error) {
        if (this.isUniqueViolation(error)) {
          return { state: 'duplicate' as const };
        }
        throw error;
      }
    });
    return outcome.state;
  }

  /**
   * Deduct points (redemption). The mirror row is locked first, so concurrent
   * spends serialize and the balance can never go negative.
   */
  async spend(params: {
    userId: string;
    amount: number;
    reason: string;
    referenceId?: string | null;
    description?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<{ balance: number }> {
    if (!Number.isInteger(params.amount) || params.amount <= 0) {
      throw new PointsRuleError('Spend amount must be a positive integer.');
    }
    const balance = await this.prisma.$transaction(async (tx) => {
      await tx.userPoints.upsert({
        where: { userId: params.userId },
        create: { userId: params.userId, balance: 0, lifetimeEarned: 0, lifetimeSpent: 0 },
        update: {},
      });
      const locked = await tx.$queryRaw<Array<{ balance: number }>>`
        SELECT "balance" FROM "user_points" WHERE "userId" = ${params.userId}::uuid FOR UPDATE`;
      const balance = locked[0]?.balance ?? 0;
      if (balance < params.amount) {
        throw new InsufficientPointsError();
      }
      return this.appendEntry(tx, {
        userId: params.userId,
        amount: -params.amount,
        type: 'SPEND',
        reason: params.reason,
        referenceId: params.referenceId ?? null,
        description: params.description ?? null,
        metadata: params.metadata ?? null,
      });
    });
    return { balance };
  }

  /** Admin-only signed correction, fully audited via metadata + notification. */
  async adjust(params: {
    userId: string;
    amount: number;
    reason: string;
    adminId: string;
  }): Promise<{ balance: number }> {
    if (
      !Number.isInteger(params.amount) ||
      params.amount === 0 ||
      Math.abs(params.amount) > 100_000
    ) {
      throw new PointsRuleError('Adjustment must be a non-zero integer within ±100000.');
    }
    const balance = await this.prisma.$transaction(async (tx) => {
      if (params.amount < 0) {
        await tx.userPoints.upsert({
          where: { userId: params.userId },
          create: { userId: params.userId, balance: 0, lifetimeEarned: 0, lifetimeSpent: 0 },
          update: {},
        });
        const locked = await tx.$queryRaw<Array<{ balance: number }>>`
          SELECT "balance" FROM "user_points" WHERE "userId" = ${params.userId}::uuid FOR UPDATE`;
        if ((locked[0]?.balance ?? 0) + params.amount < 0) {
          throw new InsufficientPointsError('Adjustment would make the balance negative.');
        }
      }
      return this.appendEntry(tx, {
        userId: params.userId,
        amount: params.amount,
        type: 'ADJUST',
        reason: params.reason,
        description: `Admin adjustment: ${params.reason}`,
        metadata: { adminId: params.adminId },
      });
    });
    this.events
      ?.notifyUser({
        userId: params.userId,
        type: 'POINTS_ADJUSTED',
        title: `Points ${params.amount > 0 ? 'added' : 'deducted'}: ${params.amount > 0 ? '+' : ''}${params.amount}`,
        body: params.reason,
      })
      .catch(() => undefined);
    return { balance };
  }

  /** Refund a spend (redemption cancellation). Positive REFUND entry. */
  async refund(params: {
    userId: string;
    amount: number;
    reason: string;
    referenceId?: string | null;
    description?: string | null;
  }): Promise<{ balance: number }> {
    this.assertSaneAmount(params.amount);
    const outcome = await this.prisma.$transaction(async (tx) => {
      if (params.referenceId) {
        const existing = await tx.pointTransaction.findFirst({
          where: { userId: params.userId, reason: params.reason, referenceId: params.referenceId },
        });
        if (existing) {
          return { duplicate: true as const };
        }
      }
      try {
        const balance = await this.appendEntry(tx, {
          userId: params.userId,
          amount: params.amount,
          type: 'REFUND',
          reason: params.reason,
          referenceId: params.referenceId ?? null,
          description: params.description ?? null,
        });
        return { duplicate: false as const, balance };
      } catch (error) {
        if (this.isUniqueViolation(error)) {
          return { duplicate: true as const };
        }
        throw error;
      }
    });
    if (outcome.duplicate) {
      return { balance: await this.balanceOf(params.userId) };
    }
    return { balance: outcome.balance };
  }

  async summary(userId: string): Promise<PointsSummaryDto> {
    const [mirror, recent] = await Promise.all([
      this.prisma.userPoints.findUnique({ where: { userId } }),
      this.prisma.pointTransaction.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 10,
        select: {
          id: true,
          amount: true,
          type: true,
          reason: true,
          description: true,
          createdAt: true,
          balanceAfter: true,
        },
      }),
    ]);
    return {
      total: mirror?.balance ?? 0,
      earned: mirror?.lifetimeEarned ?? 0,
      lifetimeEarned: mirror?.lifetimeEarned ?? 0,
      lifetimeSpent: mirror?.lifetimeSpent ?? 0,
      recent: recent.map((row) => ({
        id: row.id,
        amount: row.amount,
        type: row.type,
        reason: row.reason,
        description: row.description,
        createdAt: row.createdAt.toISOString(),
        balanceAfter: row.balanceAfter,
      })),
    };
  }

  async history(
    userId: string,
    query: PointsHistoryQuery,
  ): Promise<{
    items: PointsHistoryItemDto[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> {
    const where = { userId, ...(query.type ? { type: query.type } : {}) };
    const [total, rows] = await Promise.all([
      this.prisma.pointTransaction.count({ where }),
      this.prisma.pointTransaction.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          amount: true,
          type: true,
          reason: true,
          description: true,
          sourceType: true,
          balanceAfter: true,
          createdAt: true,
        },
      }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        amount: row.amount,
        type: row.type,
        reason: row.reason,
        description: row.description,
        sourceType: row.sourceType,
        balanceAfter: row.balanceAfter,
        createdAt: row.createdAt.toISOString(),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  /** Ledger integrity check: mirror balance must equal the signed sum. */
  async verify(
    userId: string,
  ): Promise<{ consistent: boolean; balance: number; ledgerSum: number }> {
    const [mirror, sum] = await Promise.all([
      this.prisma.userPoints.findUnique({ where: { userId } }),
      this.prisma.pointTransaction.aggregate({ where: { userId }, _sum: { amount: true } }),
    ]);
    const balance = mirror?.balance ?? 0;
    const ledgerSum = sum._sum.amount ?? 0;
    return { consistent: balance === ledgerSum, balance, ledgerSum };
  }

  /** Points earned today (UTC) — abuse-signal input, not a reward path. */
  async earnedToday(userId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const sum = await this.prisma.pointTransaction.aggregate({
      where: { userId, type: 'EARN', createdAt: { gte: startOfDay } },
      _sum: { amount: true },
    });
    return sum._sum.amount ?? 0;
  }

  /**
   * Ensure the mirror row exists and lock it. Returns the locked balance.
   * Public so redemption flows can share one transaction with ledger writes.
   */
  async ensureMirror(tx: LedgerTx, userId: string): Promise<number> {
    await tx.userPoints.upsert({
      where: { userId },
      create: { userId, balance: 0, lifetimeEarned: 0, lifetimeSpent: 0 },
      update: {},
    });
    const locked = await tx.$queryRaw<Array<{ balance: number }>>`
      SELECT "balance" FROM "user_points" WHERE "userId" = ${userId}::uuid FOR UPDATE`;
    return locked[0]?.balance ?? 0;
  }

  /**
   * Append one ledger row and sync the mirror. Callers must hold the mirror
   * lock (see ensureMirror) inside the same transaction.
   */
  async appendEntry(tx: LedgerTx, entry: LedgerEntry): Promise<number> {
    await tx.userPoints.upsert({
      where: { userId: entry.userId },
      create: { userId: entry.userId, balance: 0, lifetimeEarned: 0, lifetimeSpent: 0 },
      update: {},
    });
    const locked = await tx.$queryRaw<Array<{ balance: number }>>`
      SELECT "balance" FROM "user_points" WHERE "userId" = ${entry.userId}::uuid FOR UPDATE`;
    const balance = locked[0]?.balance ?? 0;
    const next = balance + entry.amount;
    if (next < 0) {
      throw new InsufficientPointsError();
    }
    await tx.pointTransaction.create({
      data: {
        userId: entry.userId,
        amount: entry.amount,
        balanceAfter: next,
        type: entry.type,
        reason: entry.reason,
        referenceId: entry.referenceId ?? null,
        sourceType: entry.sourceType ?? null,
        sourceId: entry.sourceId ?? null,
        description: entry.description ?? null,
        metadata: (entry.metadata ?? undefined) as unknown as object | undefined,
      },
    });
    if (entry.type === 'SPEND' || entry.type === 'REVERSAL') {
      await tx.userPoints.update({
        where: { userId: entry.userId },
        data: { balance: next, lifetimeSpent: { increment: Math.abs(entry.amount) } },
      });
    } else if (entry.type === 'EARN' || entry.type === 'REFUND') {
      await tx.userPoints.update({
        where: { userId: entry.userId },
        data: { balance: next, lifetimeEarned: { increment: entry.amount } },
      });
    } else {
      await tx.userPoints.update({
        where: { userId: entry.userId },
        data: {
          balance: next,
          ...(entry.amount >= 0
            ? { lifetimeEarned: { increment: entry.amount } }
            : { lifetimeSpent: { increment: Math.abs(entry.amount) } }),
        },
      });
    }
    return next;
  }

  private async balanceOf(userId: string): Promise<number> {
    const mirror = await this.prisma.userPoints.findUnique({
      where: { userId },
      select: { balance: true },
    });
    return mirror?.balance ?? 0;
  }

  /** All active rules, cached 60s. Mutations must call clearRuleCache(). */
  private async activeRules(): Promise<CachedRule[]> {
    const now = Date.now();
    if (!this.ruleCache || now - this.ruleCache.at > RULE_CACHE_TTL_MS) {
      const rules = await this.prisma.rewardRule.findMany({ where: { isActive: true } });
      this.ruleCache = {
        at: now,
        rules: rules.map((rule) => ({
          key: rule.key,
          name: rule.name,
          points: rule.points,
          category: rule.category,
          trigger: rule.trigger ?? rule.key,
          dailyCap: rule.dailyCap ?? null,
          maxPerUser: rule.maxPerUser ?? null,
          cooldownSeconds: rule.cooldownSeconds ?? null,
          validFrom: rule.validFrom ?? null,
          validTo: rule.validTo ?? null,
          isActive: rule.isActive,
        })),
      };
    }
    return this.ruleCache.rules;
  }

  /** Test hook: drop the cached rule set. */
  clearRuleCache(): void {
    this.ruleCache = null;
  }

  private assertSaneAmount(amount: number): void {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new PointsRuleError('Points awards must be positive integers.');
    }
    if (amount > 10_000) {
      throw new PointsRuleError('Points award exceeds the per-event cap.');
    }
  }

  private notifyEarned(userId: string, amount: number, description: string): void {
    this.events
      ?.notifyUser({
        userId,
        type: 'POINTS_EARNED',
        title: `+${amount} points earned`,
        body: description.slice(0, 500),
      })
      .catch(() => undefined);
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
    );
  }
}
