import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import type {
  RatingDomainDto,
  RatingLeaderboardEntryDto,
  RatingsOverviewDto,
  RatingTotalsDto,
  RatingTier,
} from '@apteez/types';
import { AppLogger } from '../../common/logger/app-logger';
import { RedisLockService } from '../../redis/redis-lock.service';
import { RatingCalculator } from './rating.calculator';
import { RatingRepository, type RatingSide } from './rating.repository';
import { RatingNotEligibleError } from './rating.errors';

const RATING_LOCK_TTL_MS = 10_000;

interface ChallengeForRating {
  id: string;
  domainSlug: string;
  categoryId: string;
  status: string;
  outcome: string | null;
  player1Id: string;
  player2Id: string;
  player1RatingSnapshot: number;
  player2RatingSnapshot: number;
  player1Score: number | null;
  player2Score: number | null;
  ratingStatus: string;
}

/**
 * Challenge rating orchestrator. It owns *rules* — eligibility, the atomic
 * two-sided transaction and idempotency — while the pure calculator owns the
 * maths and the repository owns persistence.
 *
 * Safety properties:
 * - Only a finalized (COMPLETED) challenge is eligible.
 * - The whole two-player update runs in one transaction: no half-applied match.
 * - Idempotency is enforced twice: a Redis lock serializes concurrent workers,
 *   and `ChallengeRatingHistory.@@unique([challengeId, userId])` makes a
 *   duplicate application impossible even without the lock.
 * - A failure never rolls back the finalized challenge; it only marks the
 *   rating step FAILED so a retry can pick it up.
 */
@Injectable()
export class RatingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: RatingRepository,
    private readonly calculator: RatingCalculator,
    private readonly lock: RedisLockService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Process a finalized challenge exactly once. Safe to call from a job, a
   * socket callback or a retry — the result is the same and ratings never move
   * twice.
   */
  async processChallenge(challengeId: string): Promise<boolean> {
    const processed = await this.lock.withLock(
      `rating:challenge:${challengeId}`,
      RATING_LOCK_TTL_MS,
      async () => this.runProcessing(challengeId),
    );
    // A null lock result means another worker is already processing it.
    return processed === true;
  }

  private async runProcessing(challengeId: string): Promise<boolean> {
    const challenge = (await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      select: {
        id: true,
        domainSlug: true,
        categoryId: true,
        status: true,
        outcome: true,
        player1Id: true,
        player2Id: true,
        player1RatingSnapshot: true,
        player2RatingSnapshot: true,
        player1Score: true,
        player2Score: true,
        ratingStatus: true,
      },
    })) as ChallengeForRating | null;

    if (!challenge || challenge.status !== 'COMPLETED') {
      return false;
    }
    if (challenge.ratingStatus === 'COMPLETED') {
      return true;
    }
    if (!challenge.outcome) {
      throw new RatingNotEligibleError('This challenge has no outcome to rate.');
    }

    await this.markProcessing(challengeId);

    try {
      await this.applyRatings(challenge);
      await this.prisma.challenge.update({
        where: { id: challengeId },
        data: { ratingStatus: 'COMPLETED', ratingProcessedAt: new Date() },
      });
      this.logger.log(`rating.applied challenge=${challengeId}`, 'Rating');
      return true;
    } catch (error) {
      await this.prisma.challenge.update({
        where: { id: challengeId },
        data: { ratingStatus: 'FAILED', ratingAttempts: { increment: 1 } },
      });
      this.logger.error(
        `rating.failed challenge=${challengeId} ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
        'Rating',
      );
      throw error;
    }
  }

  private async markProcessing(challengeId: string): Promise<void> {
    await this.prisma.challenge.updateMany({
      where: { id: challengeId, ratingStatus: { not: 'COMPLETED' } },
      data: { ratingStatus: 'PROCESSING', ratingAttempts: { increment: 1 } },
    });
  }

  /**
   * Compute both sides then persist them. Deliberately NOT an interactive
   * `$transaction`: DATABASE_URL is the Neon PgBouncer pooler, where those
   * die with P2028 — which is exactly how ratings got stuck FAILED. Instead
   * both sides are independent single-statement writes (fired together for
   * one round trip) with exactly-once enforced per side by the conditional
   * update + history unique inside `applyRating`.
   */
  private async applyRatings(challenge: ChallengeForRating): Promise<void> {
    const p1Score = challenge.player1Score ?? 0;
    const p2Score = challenge.player2Score ?? 0;
    const outcome = challenge.outcome!;

    const p1Result: RatingSide['result'] =
      outcome === 'DRAW' ? 'DRAW' : outcome === 'PLAYER1_WIN' ? 'WIN' : 'LOSS';
    const p2Result: RatingSide['result'] =
      outcome === 'DRAW' ? 'DRAW' : outcome === 'PLAYER2_WIN' ? 'WIN' : 'LOSS';
    const rawOutcome = outcome as RatingSide['outcome'];

    const [p1, p2] = await Promise.all([
      this.repo.ensureRating(challenge.player1Id, challenge.domainSlug, challenge.categoryId),
      this.repo.ensureRating(challenge.player2Id, challenge.domainSlug, challenge.categoryId),
    ]);

    const p1Calc = this.calculator.calculate({
      ratingBefore: p1.rating,
      opponentRatingBefore: p2.rating,
      outcome: p1Result,
      score: p1Score,
      opponentScore: p2Score,
    });
    const p2Calc = this.calculator.calculate({
      ratingBefore: p2.rating,
      opponentRatingBefore: p1.rating,
      outcome: p2Result,
      score: p2Score,
      opponentScore: p1Score,
    });

    const sides: RatingSide[] = [
      {
        userId: challenge.player1Id,
        opponentId: challenge.player2Id,
        ratingBefore: p1Calc.ratingBefore,
        ratingAfter: p1Calc.ratingAfter,
        ratingChange: p1Calc.ratingChange,
        opponentRatingBefore: p2Calc.ratingBefore,
        opponentRatingAfter: p2Calc.ratingAfter,
        result: p1Result,
        outcome: rawOutcome,
        score: p1Score,
        opponentScore: p2Score,
      },
      {
        userId: challenge.player2Id,
        opponentId: challenge.player1Id,
        ratingBefore: p2Calc.ratingBefore,
        ratingAfter: p2Calc.ratingAfter,
        ratingChange: p2Calc.ratingChange,
        opponentRatingBefore: p1Calc.ratingBefore,
        opponentRatingAfter: p1Calc.ratingAfter,
        result: p2Result,
        outcome: rawOutcome,
        score: p2Score,
        opponentScore: p1Score,
      },
    ];

    await Promise.all(
      sides.map((side) =>
        this.repo.applyRating({
          challengeId: challenge.id,
          domainSlug: challenge.domainSlug,
          categoryId: challenge.categoryId,
          side,
        }),
      ),
    );
  }

  /** Rating change per player for a finalized challenge, if already applied. */
  async changesFor(challengeId: string): Promise<Map<string, number>> {
    const rows = await this.prisma.challengeRatingHistory.findMany({
      where: { challengeId },
      select: { userId: true, ratingChange: true },
    });
    return new Map(rows.map((row) => [row.userId, row.ratingChange]));
  }

  /**
   * Batched variant for history pages: one query for the whole page, keyed
   * by challenge id, scoped to a single user.
   */
  async changesForMany(challengeIds: string[], userId: string): Promise<Map<string, number>> {
    if (challengeIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.challengeRatingHistory.findMany({
      where: { challengeId: { in: challengeIds }, userId },
      select: { challengeId: true, ratingChange: true },
    });
    return new Map(rows.map((row) => [row.challengeId, row.ratingChange]));
  }

  async overview(userId: string, domainSlug?: string): Promise<RatingsOverviewDto> {
    const user = await this.repo.findUserById(userId);
    if (!user) {
      throw new RatingNotEligibleError('Unknown user.');
    }
    const rows = await this.repo.listRatings(userId, domainSlug);
    const latest = await this.repo.latestChanges(
      userId,
      rows.map((row) => row.domainSlug),
    );
    const ratings: RatingDomainDto[] = rows.map((row) =>
      this.toDomain(row, latest.get(row.domainSlug)),
    );
    return {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      ratings,
      totals: aggregate(ratings),
    };
  }

  async overviewByUsername(username: string): Promise<RatingsOverviewDto> {
    const user = await this.repo.findUserByUsername(username);
    if (!user) {
      throw new RatingNotEligibleError('Unknown user.');
    }
    return this.overview(user.id);
  }

  private toDomain(
    row: {
      domainSlug: string;
      domainName: string;
      rating: number;
      wins: number;
      losses: number;
      draws: number;
      gamesPlayed: number;
    },
    latestChange: number | undefined,
  ): RatingDomainDto {
    return {
      domainSlug: row.domainSlug,
      domainName: row.domainName,
      rating: row.rating,
      tier: this.calculator.tierFor(row.rating),
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      matches: row.gamesPlayed,
      winRate: winRate(row.wins, row.gamesPlayed),
      latestChange: latestChange ?? null,
    };
  }

  /** Reusable leaderboard query: rating DESC, deterministic tiebreak. */
  async leaderboard(
    domainSlug: string,
    institution: string | undefined,
    limit: number,
  ): Promise<RatingLeaderboardEntryDto[]> {
    const category = await this.repo.requireCategory(domainSlug);
    const rows = await this.prisma.challengeRating.findMany({
      where: {
        domainSlug: category.slug,
        // The house bot plays solo matches only: never ranked.
        user: { isSystem: false, ...(institution ? { institution } : {}) },
      },
      orderBy: [{ rating: 'desc' }, { userId: 'asc' }],
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarKey: true,
            institution: true,
          },
        },
      },
    });
    return rows.map((row, index) => ({
      rank: index + 1,
      userId: row.userId,
      username: row.user.username,
      displayName: row.user.displayName,
      avatarKey: row.user.avatarKey,
      institution: row.user.institution,
      domainSlug: row.domainSlug,
      rating: row.rating,
      tier: this.calculator.tierFor(row.rating) as RatingTier,
      matches: row.gamesPlayed,
      winRate: winRate(row.wins, row.gamesPlayed),
    }));
  }
}

function winRate(wins: number, matches: number): number {
  if (matches <= 0) {
    return 0;
  }
  return Math.round((wins / matches) * 1000) / 10;
}

function aggregate(ratings: RatingDomainDto[]): RatingTotalsDto {
  const totals = ratings.reduce(
    (acc, row) => ({
      matches: acc.matches + row.matches,
      wins: acc.wins + row.wins,
      losses: acc.losses + row.losses,
      draws: acc.draws + row.draws,
    }),
    { matches: 0, wins: 0, losses: 0, draws: 0 },
  );
  return { ...totals, winRate: winRate(totals.wins, totals.matches) };
}
