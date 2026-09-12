import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import { DEFAULT_CONTEST_RATING } from './contest-rating.calculator';

/**
 * Persistence boundary for the contest engine. Centralizes the small set of
 * queries the service layer needs so unique constraints (the real idempotency
 * guards) live next to the code that relies on them.
 */
@Injectable()
export class ContestRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Lazy-create the user's global contest rating at 1000 (race-safe). */
  async ensureContestRating(userId: string): Promise<{ userId: string; rating: number }> {
    const existing = await this.prisma.contestRating.findUnique({ where: { userId } });
    if (existing) {
      return existing;
    }
    try {
      return await this.prisma.contestRating.create({
        data: { userId, rating: DEFAULT_CONTEST_RATING },
      });
    } catch {
      return this.prisma.contestRating.findUniqueOrThrow({ where: { userId } });
    }
  }
}
