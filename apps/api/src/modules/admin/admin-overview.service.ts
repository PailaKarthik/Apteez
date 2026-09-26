import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import type { AdminOverviewDto } from '@apteez/types';
import { AppLogger } from '../../common/logger/app-logger';
import { RedisService } from '../../redis/redis.service';
import { redisKeys } from '../../redis/redis-keys';

const OVERVIEW_TTL_SECONDS = 60;

/**
 * Operational snapshot for the admin dashboard. Bounded count queries run in
 * parallel and the whole payload is cached for 60s — counts, never raw rows.
 * Every number derives from PostgreSQL; nothing is fabricated.
 */
@Injectable()
export class AdminOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly logger: AppLogger,
  ) {}

  async overview(): Promise<AdminOverviewDto> {
    const key = redisKeys.adminOverview();
    try {
      if (this.redis.isReady()) {
        const cached = await this.redis.get(key);
        if (cached) {
          return JSON.parse(cached) as AdminOverviewDto;
        }
      }
    } catch {
      // Fall through to a fresh computation.
    }
    const now = new Date();
    const day7 = new Date(now.getTime() - 7 * 86_400_000);
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const [
      totalUsers,
      activeUsers,
      newUsers,
      suspendedUsers,
      publishedProblems,
      pendingContributions,
      rejectedContributions,
      reportedProblems,
      liveContests,
      upcomingContests,
      liveEvents,
      upcomingEvents,
      openReports,
      openDiscussionReports,
      activeChallenges,
      activeRewards,
      pendingRedemptions,
      pointsEarned,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { createdAt: { gte: day7 } } }),
      this.prisma.user.count({ where: { isActive: false } }),
      this.prisma.problem.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.contribution.count({ where: { status: { in: ['PENDING', 'UNDER_REVIEW'] } } }),
      this.prisma.contribution.count({ where: { status: 'REJECTED' } }),
      this.prisma.report.count({
        where: { targetType: 'PROBLEM', status: { in: ['OPEN', 'UNDER_REVIEW'] } },
      }),
      this.prisma.contest.count({ where: { status: 'LIVE' } }),
      this.prisma.contest.count({ where: { status: { in: ['PUBLISHED', 'REGISTRATION_OPEN'] } } }),
      this.prisma.event.count({ where: { status: 'LIVE' } }),
      this.prisma.event.count({
        where: { status: { in: ['PUBLISHED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED'] } },
      }),
      this.prisma.report.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } }),
      this.prisma.discussionReport.count({ where: { status: 'OPEN' } }),
      this.prisma.challenge.count({
        where: { status: { in: ['MATCHMAKING', 'MATCHED', 'COUNTDOWN', 'LIVE'] } },
      }),
      this.prisma.reward.count({ where: { isActive: true } }),
      this.prisma.rewardRedemption.count({ where: { status: { in: ['PENDING', 'PROCESSING'] } } }),
      this.prisma.pointTransaction.aggregate({
        where: { type: 'EARN', createdAt: { gte: dayStart } },
        _sum: { amount: true },
      }),
    ]);
    const payload: AdminOverviewDto = {
      users: { total: totalUsers, active: activeUsers, new7d: newUsers, suspended: suspendedUsers },
      content: {
        publishedProblems,
        pendingContributions,
        rejectedContributions,
        reportedProblems,
      },
      competition: { liveContests, upcomingContests, liveEvents, upcomingEvents },
      community: { openReports, openDiscussionReports, activeChallenges },
      rewards: {
        activeRewards,
        pendingRedemptions,
        pointsEarnedToday: pointsEarned._sum.amount ?? 0,
      },
      generatedAt: now.toISOString(),
    };
    try {
      if (this.redis.isReady()) {
        await this.redis.set(key, JSON.stringify(payload), OVERVIEW_TTL_SECONDS);
      }
    } catch (error) {
      this.logger.warn(`admin.overview-cache-failed ${String(error)}`, 'Admin');
    }
    return payload;
  }
}
