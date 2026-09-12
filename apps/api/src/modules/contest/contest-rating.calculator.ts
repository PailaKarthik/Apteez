import type { RatingTier } from '@apteez/types';

export interface ContestRatingConfig {
  kFactor: number;
  /** Rating floor/ceiling so one contest can never destroy or inflate a rating. */
  minRating: number;
  maxRating: number;
  /** Maximum signed move per contest, applied after the rank computation. */
  maxChange: number;
  tierThresholds: ReadonlyArray<{ tier: RatingTier; min: number }>;
}

export const DEFAULT_CONTEST_RATING_CONFIG: ContestRatingConfig = {
  kFactor: 24,
  minRating: 100,
  maxRating: 4000,
  maxChange: 64,
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
}

export interface ContestRatingResult {
  ratingBefore: number;
  ratingAfter: number;
  ratingChange: number;
  expectedRank: number;
}

/**
 * Simple deterministic rank-based contest rating foundation.
 *
 * - Expected rank comes from the Elo win-probability of `ratingBefore`
 *   against the field average (or self when the field is unknown).
 * - Over/under-performance vs expectation moves the rating linearly,
 *   scaled by K and normalized by field size.
 * - The change is clamped to [-maxChange, maxChange] and the result to
 *   [minRating, maxRating]; everything is rounded to whole points.
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
    const rawChange = Math.round(this.config.kFactor * 2 * performance);
    const ratingChange = Math.max(
      -this.config.maxChange,
      Math.min(this.config.maxChange, rawChange),
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
    };
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
