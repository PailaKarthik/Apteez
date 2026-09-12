import type { RatingTier } from '@apteez/types';
import { DEFAULT_RATING_CONFIG, type RatingConfig } from './rating.config';

/** The 0/0.5/1 score a player earns from a match. */
export type RatingScore = 0 | 0.5 | 1;

/** Points of view a match can resolve to for one player. */
export type RatingOutcome = 'WIN' | 'LOSS' | 'DRAW';

export interface RatingCalculationInput {
  /** Player's rating before the match (whole points). */
  ratingBefore: number;
  /** Opponent's rating before the match (whole points). */
  opponentRatingBefore: number;
  /** Result from this player's perspective. */
  outcome: RatingOutcome;
  /** Final challenge score for this player (correct − wrong). */
  score: number;
  /** Final challenge score for the opponent. */
  opponentScore: number;
}

export interface RatingCalculationResult {
  ratingBefore: number;
  ratingAfter: number;
  ratingChange: number;
  /** Probability this player was expected to win, 0–1. */
  expectedScore: number;
  /** The 0/0.5/1 actual score used. */
  actualScore: RatingScore;
  /** Effective K after the (optional) score-margin adjustment. */
  effectiveK: number;
}

const OUTCOME_SCORE: Record<RatingOutcome, RatingScore> = {
  WIN: 1,
  LOSS: 0,
  DRAW: 0.5,
};

/**
 * Pure, deterministic Elo-style challenge rating calculator.
 *
 * It depends on nothing but its arguments and a config object — no HTTP, no
 * Redis, no Prisma, no framework state — so the algorithm is independently
 * testable and replaceable. It never reads client data; callers pass only
 * server-authoritative values from a finalized challenge.
 *
 * Formula:
 *   E  = 1 / (1 + 10 ^ ((Rb − Ra) / 400))
 *   K' = K × (1 + marginWeight × marginFactor)   [bounded]
 *   Ra' = clamp(round(Ra + K' × (Sa − E)))
 *
 * Rounding: the final rating is rounded to the nearest whole point and clamped
 * to [minRating, maxRating]; the change is the rounded after minus before, so
 * ratings never accumulate floating-point error.
 */
export class RatingCalculator {
  constructor(private readonly config: RatingConfig = DEFAULT_RATING_CONFIG) {}

  calculate(input: RatingCalculationInput): RatingCalculationResult {
    const actualScore = OUTCOME_SCORE[input.outcome];
    const expectedScore = this.expectedScore(input.ratingBefore, input.opponentRatingBefore);
    const effectiveK = this.effectiveK(input.score, input.opponentScore);
    const rawAfter = input.ratingBefore + effectiveK * (actualScore - expectedScore);
    const ratingAfter = this.clamp(Math.round(rawAfter));
    return {
      ratingBefore: input.ratingBefore,
      ratingAfter,
      ratingChange: ratingAfter - input.ratingBefore,
      expectedScore,
      actualScore,
      effectiveK,
    };
  }

  /** Elo expectation that `rating` beats `opponentRating`. */
  expectedScore(rating: number, opponentRating: number): number {
    return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
  }

  /**
   * K scaled by a bounded score-margin factor. A bigger win moves the rating a
   * little further than a narrow one, but the core result always dominates:
   * the multiplier never exceeds 1 + marginWeight.
   */
  effectiveK(score: number, opponentScore: number): number {
    if (this.config.marginWeight <= 0) {
      return this.config.kFactor;
    }
    const margin = Math.abs(score - opponentScore);
    const normalized = Math.min(this.config.marginCap, margin / 10);
    return this.config.kFactor * (1 + this.config.marginWeight * normalized);
  }

  /** Derived display tier for a rating; the numeric rating stays the truth. */
  tierFor(rating: number): RatingTier {
    for (const { tier, min } of this.config.tierThresholds) {
      if (rating >= min) {
        return tier;
      }
    }
    return this.config.tierThresholds[this.config.tierThresholds.length - 1]!.tier;
  }

  clamp(rating: number): number {
    return Math.min(this.config.maxRating, Math.max(this.config.minRating, rating));
  }
}
