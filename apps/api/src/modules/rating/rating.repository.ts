import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@apteez/database';
import { DEFAULT_CHALLENGE_RATING } from './rating.config';
import { RatingDomainNotFoundError } from './rating.errors';

export interface RatingRow {
  userId: string;
  domainSlug: string;
  categoryId: string;
  rating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  lastPlayedAt: Date | null;
}

export interface RatingWithDomain extends RatingRow {
  domainName: string;
}

/** One player's fully-computed side of a rated challenge. */
export interface RatingSide {
  userId: string;
  opponentId: string | null;
  ratingBefore: number;
  ratingAfter: number;
  ratingChange: number;
  opponentRatingBefore: number;
  opponentRatingAfter: number;
  /** Result from this player's point of view (persisted for filtering). */
  result: 'WIN' | 'LOSS' | 'DRAW';
  /** Raw challenge outcome (same for both players). */
  outcome: 'PLAYER1_WIN' | 'PLAYER2_WIN' | 'DRAW' | 'ABANDONED' | 'EXPIRED' | 'CANCELLED';
  score: number;
  opponentScore: number;
}

export interface RecordRatingInput {
  challengeId: string;
  domainSlug: string;
  categoryId: string;
  side: RatingSide;
}

/**
 * Persistence boundary for the rating engine. All permanent rating reads and
 * writes funnel through here so the service layer stays about rules, not SQL,
 * and so the unique constraints that make processing idempotent live next to
 * the code that relies on them.
 */
@Injectable()
export class RatingRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolve a domain slug to its category, or throw a 404. */
  async requireCategory(domainSlug: string): Promise<{ id: string; name: string; slug: string }> {
    const category = await this.prisma.category.findFirst({
      where: { slug: domainSlug, isActive: true },
      select: { id: true, name: true, slug: true },
    });
    if (!category) {
      throw new RatingDomainNotFoundError();
    }
    return category;
  }

  /**
   * Lazy-create the (user, domain) rating at the default value if it is
   * missing, then return the row. Concurrency-safe: the unique key is the
   * primary key, so a racing insert is swallowed and re-read. Runs outside
   * any interactive transaction (Neon pooler kills those with P2028).
   */
  async ensureRating(userId: string, domainSlug: string, categoryId: string): Promise<RatingRow> {
    const existing = await this.prisma.challengeRating.findUnique({
      where: { userId_domainSlug: { userId, domainSlug } },
    });
    if (existing) {
      return existing;
    }
    try {
      return await this.prisma.challengeRating.create({
        data: { userId, domainSlug, categoryId, rating: DEFAULT_CHALLENGE_RATING },
      });
    } catch {
      const row = await this.prisma.challengeRating.findUnique({
        where: { userId_domainSlug: { userId, domainSlug } },
      });
      if (!row) {
        throw new RatingDomainNotFoundError();
      }
      return row;
    }
  }

  /**
   * Apply one player's rating change and append its history row — without an
   * interactive transaction (Neon pooler kills those with P2028). Exactly-once
   * per side is enforced by a conditional update instead:
   *
   * - The rating row moves only when it still holds the expected `before`
   *   value, so a retried attempt can never double-apply.
   * - The history insert carries `@@unique([challengeId, userId])`, so a
   *   duplicate is rejected at the database level.
   * - Crash between the two is healed on retry: if the row already shows the
   *   `after` value with no history row yet, only the history insert is
   *   replayed. Anything else means genuine concurrent movement (unreachable
   *   under the processing lock) and throws loudly instead of corrupting.
   */
  async applyRating(input: RecordRatingInput): Promise<'applied' | 'already'> {
    const { side } = input;
    const key = { userId: side.userId, domainSlug: input.domainSlug };
    const updated = await this.prisma.challengeRating.updateMany({
      where: { userId: key.userId, domainSlug: key.domainSlug, rating: side.ratingBefore },
      data: {
        rating: side.ratingAfter,
        gamesPlayed: { increment: 1 },
        wins: side.result === 'WIN' ? { increment: 1 } : undefined,
        losses: side.result === 'LOSS' ? { increment: 1 } : undefined,
        draws: side.result === 'DRAW' ? { increment: 1 } : undefined,
        lastPlayedAt: new Date(),
      },
    });
    if (updated.count === 1) {
      await this.createHistory(input);
      return 'applied';
    }
    const hist = await this.prisma.challengeRatingHistory.findUnique({
      where: { challengeId_userId: { challengeId: input.challengeId, userId: side.userId } },
      select: { id: true },
    });
    if (hist) {
      return 'already';
    }
    const current = await this.prisma.challengeRating.findUnique({
      where: { userId_domainSlug: key },
      select: { rating: true },
    });
    if (current && current.rating === side.ratingAfter) {
      await this.createHistory(input);
      return 'applied';
    }
    throw new Error(`rating moved concurrently user=${side.userId} challenge=${input.challengeId}`);
  }

  private async createHistory(input: RecordRatingInput): Promise<void> {
    const { side } = input;
    try {
      await this.prisma.challengeRatingHistory.create({
        data: {
          userId: side.userId,
          domainSlug: input.domainSlug,
          categoryId: input.categoryId,
          challengeId: input.challengeId,
          opponentId: side.opponentId,
          ratingBefore: side.ratingBefore,
          ratingAfter: side.ratingAfter,
          ratingChange: side.ratingChange,
          opponentRatingBefore: side.opponentRatingBefore,
          opponentRatingAfter: side.opponentRatingAfter,
          outcome: side.outcome,
          result: side.result,
          score: side.score,
          opponentScore: side.opponentScore,
        },
      });
    } catch (error) {
      // A racing attempt already recorded this side: the rating row moved
      // exactly once via the conditional update above, so this is convergence.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return;
      }
      throw error;
    }
  }

  async listRatings(userId: string, domainSlug?: string): Promise<RatingWithDomain[]> {
    const rows = await this.prisma.challengeRating.findMany({
      where: { userId, ...(domainSlug ? { domainSlug } : {}) },
      include: { category: { select: { name: true } } },
      orderBy: [{ rating: 'desc' }, { domainSlug: 'asc' }],
    });
    return rows.map((row) => ({ ...row, domainName: row.category.name }));
  }

  /** Most recent signed change per domain, for the "latest change" column. */
  async latestChanges(userId: string, domainSlugs: string[]): Promise<Map<string, number>> {
    if (domainSlugs.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.challengeRatingHistory.findMany({
      where: { userId, domainSlug: { in: domainSlugs } },
      orderBy: { createdAt: 'desc' },
      distinct: ['domainSlug'],
      select: { domainSlug: true, ratingChange: true },
    });
    return new Map(rows.map((row) => [row.domainSlug, row.ratingChange]));
  }

  async findUserByUsername(username: string) {
    return this.prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, displayName: true },
    });
  }

  async findUserById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, displayName: true },
    });
  }
}
