import type { RatingTier } from '@apteez/types';

export interface ContestRatingConfig {
  kFactor: number;
  /** Rating floor/ceiling so one contest can never destroy or inflate a rating. */
  minRating: number;
  maxRating: number;
  /** Maximum signed move per contest, applied after the rank computation. */
  maxChange: number;
  /** Pace sensitivity: points per unit of (median - mine) / median. */
  speedKFactor: number;
  /** Maximum signed pace adjustment per contest (inside maxChange). */
  maxSpeedBonus: number;
  tierThresholds: ReadonlyArray<{ tier: RatingTier; min: number }>;
}

export const DEFAULT_CONTEST_RATING_CONFIG: ContestRatingConfig = {
  kFactor: 24,
  minRating: 100,
  maxRating: 4000,
  maxChange: 64,
  speedKFactor: 8,
  maxSpeedBonus: 8,
  tierThresholds: [
    { tier: 'ELITE', min: 1800 },
    { tier: 'EXPERT', min: 1600 },
    { tier: 'ADVANCED', min: 1400 },
    { tier: 'INTERMEDIATE', min: 1200 },
    { tier: 'BEGINNER', min: 0 },
  ],
};

/** Fresh contest rating for a user who has never played a contest. */
export const DEFAULT_CONTEST_RATING = 1000;

export interface ContestRatingInput {
  ratingBefore: number;
  /** 1-based final rank. */
  rank: number;
  /** Number of ranked participants in the contest. */
  fieldSize: number;
  /** Average rating of the field (strength adjustment), when known. */
  fieldAverage: number | null;
  /** Server-measured start→submit seconds for this participant, when known. */
  completionSeconds?: number | null;
  /** Median completion seconds across the ranked field, when known. */
  fieldMedianSeconds?: number | null;
}

export interface ContestRatingResult {
  ratingBefore: number;
  ratingAfter: number;
  ratingChange: number;
  expectedRank: number;
  /** Pace adjustment folded into ratingChange (0 when pace is unknown). */
  speedBonus: number;
}

/**
 * Deterministic rank + pace contest rating foundation.
 *
 * - Expected rank comes from the Elo win-probability of `ratingBefore`
 *   against the field average (or self when the field is unknown).
 * - Over/under-performance vs expectation moves the rating linearly,
 *   scaled by K and normalized by field size.
 * - Pace: finishing faster than the field median earns a bounded bonus
 *   (slower loses up to the same bound) — so submission speed moves the
 *   rating directly, not just through the time tiebreak in ranks.
 * - The total change is clamped to [-maxChange, maxChange] and the result
 *   to [minRating, maxRating]; everything is rounded to whole points.
 */
export class ContestRatingCalculator {
  constructor(private readonly config: ContestRatingConfig = DEFAULT_CONTEST_RATING_CONFIG) {}

  calculate(input: ContestRatingInput): ContestRatingResult {
    const fieldSize = Math.max(1, Math.floor(input.fieldSize));
    const rank = Math.min(fieldSize, Math.max(1, Math.floor(input.rank)));
    const field = input.fieldAverage ?? input.ratingBefore;
    const expected = 1 / (1 + 10 ** ((field - input.ratingBefore) / 400));
    const expectedRank = 1 + (1 - expected) * (fieldSize - 1);
    const performance = fieldSize <= 1 ? 0 : (expectedRank - rank) / (fieldSize - 1);
    const rankChange = Math.round(this.config.kFactor * 2 * performance);
    const speedBonus = this.speedBonus(input, fieldSize);
    const ratingChange = Math.max(
      -this.config.maxChange,
      Math.min(this.config.maxChange, rankChange + speedBonus),
    );
    const ratingAfter = Math.min(
      this.config.maxRating,
      Math.max(this.config.minRating, input.ratingBefore + ratingChange),
    );
    return {
      ratingBefore: input.ratingBefore,
      ratingAfter,
      ratingChange: ratingAfter - input.ratingBefore,
      expectedRank,
      speedBonus,
    };
  }

  /**
   * Bounded pace adjustment: +maxSpeedBonus at instant finish, -maxSpeedBonus
   * at 2x median or slower, linear in between. Zero whenever pace data is
   * missing, the field is trivial, or the median is degenerate.
   */
  private speedBonus(input: ContestRatingInput, fieldSize: number): number {
    const mine = input.completionSeconds;
    const median = input.fieldMedianSeconds;
    if (fieldSize <= 1 || mine === undefined || mine === null || mine < 0) {
      return 0;
    }
    if (median === undefined || median === null || median <= 0) {
      return 0;
    }
    const ratio = Math.max(-1, Math.min(1, (median - mine) / median));
    const bonus = Math.round(this.config.speedKFactor * ratio);
    return Math.max(-this.config.maxSpeedBonus, Math.min(this.config.maxSpeedBonus, bonus));
  }

  tierFor(rating: number): RatingTier {
    for (const { tier, min } of this.config.tierThresholds) {
      if (rating >= min) {
        return tier;
      }
    }
    return this.config.tierThresholds[this.config.tierThresholds.length - 1]!.tier;
  }
}
