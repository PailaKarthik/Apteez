import type { RatingTier } from '@apteez/types';

/**
 * Tunable parameters for the challenge rating engine. Kept in one place so the
 * formula can be re-tuned without touching Challenge, Contest or Profile code.
 * Values are deliberately data, never inlined constants scattered across
 * services.
 */
export interface RatingConfig {
  /** Elo K-factor: the maximum points a single match can move. */
  kFactor: number;
  /**
   * How strongly score margin scales K. 0 disables the margin adjustment
   * entirely (pure Elo); the winner is always decided by the challenge result,
   * never by this knob.
   */
  marginWeight: number;
  /** Upper bound (0–1) for the normalized margin multiplier. */
  marginCap: number;
  /** Rating floor — a rating can never be driven below this. */
  minRating: number;
  /** Rating ceiling — a rating can never be inflated above this. */
  maxRating: number;
  /** Ordered tier cutoffs; the highest cutoff a rating reaches wins. */
  tierThresholds: ReadonlyArray<{ tier: RatingTier; min: number }>;
}

export const DEFAULT_RATING_CONFIG: RatingConfig = {
  kFactor: 32,
  marginWeight: 0.5,
  marginCap: 1,
  minRating: 100,
  maxRating: 4000,
  tierThresholds: [
    { tier: 'ELITE', min: 1800 },
    { tier: 'EXPERT', min: 1600 },
    { tier: 'ADVANCED', min: 1400 },
    { tier: 'INTERMEDIATE', min: 1200 },
    { tier: 'BEGINNER', min: 0 },
  ],
};

/** Default competitive rating assigned to a fresh (user, domain) pair. */
export const DEFAULT_CHALLENGE_RATING = 1000;
