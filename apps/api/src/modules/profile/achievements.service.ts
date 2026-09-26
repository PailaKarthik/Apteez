import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import type { AchievementDto } from '@apteez/types';
import { AppLogger } from '../../common/logger/app-logger';
import { PointsService } from '../rewards/points.service';
import { ActivityService } from './activity.service';
import { PerformanceService } from './performance.service';

interface AchievementSignals {
  distinctSolved: number;
  bestChallengeRating: number | null;
  longestStreak: number;
  challengeWins: number;
  bestContestRank: number | null;
  contestsEntered: number;
  eventsJoined: number;
  contributionsApproved: number;
}

/**
 * Server-side achievement evaluation. Rules read canonical tables; awarding
 * is idempotent via the @@unique[userId, achievementId] constraint plus
 * idempotent point awards. There is deliberately no endpoint that grants an
 * achievement — unlocks only happen here.
 */
@Injectable()
export class AchievementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly points: PointsService,
    private readonly activity: ActivityService,
    private readonly performance: PerformanceService,
    private readonly logger: AppLogger,
  ) {}

  async list(userId: string): Promise<AchievementDto[]> {
    const [definitions, unlocked] = await Promise.all([
      this.prisma.achievement.findMany({ where: { isActive: true }, orderBy: { points: 'asc' } }),
      this.prisma.userAchievement.findMany({
        where: { userId },
        select: { achievementId: true, unlockedAt: true },
      }),
    ]);
    const unlockedById = new Map(unlocked.map((row) => [row.achievementId, row.unlockedAt]));
    return definitions.map((definition) => ({
      id: definition.id,
      key: definition.key,
      name: definition.name,
      description: definition.description,
      category: definition.category,
      points: definition.points,
      isUnlocked: unlockedById.has(definition.id),
      unlockedAt: unlockedById.get(definition.id)?.toISOString() ?? null,
    }));
  }

  /** Evaluate all rules and award newly-earned achievements. Returns new unlocks. */
  async evaluate(userId: string): Promise<string[]> {
    try {
      const [definitions, unlocked, signals] = await Promise.all([
        this.prisma.achievement.findMany({ where: { isActive: true } }),
        this.prisma.userAchievement.findMany({
          where: { userId },
          select: { achievementId: true },
        }),
        this.collectSignals(userId),
      ]);
      const owned = new Set(unlocked.map((row) => row.achievementId));
      const newly: string[] = [];
      for (const definition of definitions) {
        if (owned.has(definition.id)) {
          continue;
        }
        if (!this.isEligible(definition.key, signals)) {
          continue;
        }
        const awarded = await this.awardOnce(
          userId,
          definition.id,
          definition.key,
          definition.points,
        );
        if (awarded) {
          newly.push(definition.key);
        }
      }
      return newly;
    } catch (error) {
      this.logger.warn(
        `profile.achievements-failed user=${userId} ${error instanceof Error ? error.message : String(error)}`,
        'Profile',
      );
      return [];
    }
  }

  private async collectSignals(userId: string): Promise<AchievementSignals> {
    const [
      overall,
      ratings,
      streak,
      challengeWins,
      contestRanks,
      contestsEntered,
      eventsJoined,
      approved,
    ] = await Promise.all([
      this.performance.overall(userId),
      this.prisma.challengeRating.findMany({ where: { userId }, select: { rating: true } }),
      this.activity.streak(userId),
      this.prisma.challengeRatingHistory.count({ where: { userId, result: 'WIN' } }),
      this.prisma.contestResult.findFirst({
        where: { userId, rank: { not: null } },
        orderBy: { rank: 'asc' },
        select: { rank: true },
      }),
      this.prisma.contestParticipant.count({ where: { userId } }),
      this.prisma.eventParticipant.count({ where: { userId } }),
      this.prisma.contribution.count({ where: { contributorId: userId, status: 'APPROVED' } }),
    ]);
    return {
      distinctSolved: overall.distinctSolved,
      bestChallengeRating:
        ratings.length === 0 ? null : Math.max(...ratings.map((row) => row.rating)),
      longestStreak: streak.longest,
      challengeWins,
      bestContestRank: contestRanks?.rank ?? null,
      contestsEntered,
      eventsJoined,
      contributionsApproved: approved,
    };
  }

  /** Pure rule table — unit-testable without a database. */
  isEligible(key: string, signals: AchievementSignals): boolean {
    switch (key) {
      case 'first-solve':
        return signals.distinctSolved >= 1;
      case 'solve-100':
        return signals.distinctSolved >= 100;
      case 'solve-500':
        return signals.distinctSolved >= 500;
      case 'solve-1000':
        return signals.distinctSolved >= 1000;
      case 'rating-1500':
        return (signals.bestChallengeRating ?? 0) >= 1500;
      case 'streak-30':
        return signals.longestStreak >= 30;
      case 'streak-50':
        return signals.longestStreak >= 50;
      case 'streak-100':
        return signals.longestStreak >= 100;
      case 'challenge-winner':
        return signals.challengeWins >= 1;
      case 'contest-top-10':
        return signals.bestContestRank !== null && signals.bestContestRank <= 10;
      case 'first-contest':
        return signals.contestsEntered >= 1;
      case 'first-event':
        return signals.eventsJoined >= 1;
      case 'contribution-approved':
        return signals.contributionsApproved >= 1;
      default:
        return false;
    }
  }

  private async awardOnce(
    userId: string,
    achievementId: string,
    key: string,
    points: number,
  ): Promise<boolean> {
    try {
      await this.prisma.userAchievement.create({ data: { userId, achievementId } });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: string }).code === 'P2002'
      ) {
        return false;
      }
      throw error;
    }
    if (points > 0) {
      await this.points.awardOnce({
        userId,
        amount: points,
        reason: 'achievement:unlock',
        referenceId: key,
      });
    }
    return true;
  }
}
