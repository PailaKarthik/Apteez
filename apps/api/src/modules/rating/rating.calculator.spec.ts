import { RatingCalculator } from './rating.calculator';
import { DEFAULT_RATING_CONFIG, type RatingConfig } from './rating.config';

describe('RatingCalculator', () => {
  const calculator = new RatingCalculator();

  it('moves an equal-rated winner up by about half of K', () => {
    const result = calculator.calculate({
      ratingBefore: 1000,
      opponentRatingBefore: 1000,
      outcome: 'WIN',
      score: 0,
      opponentScore: 0,
    });
    expect(result.expectedScore).toBeCloseTo(0.5, 5);
    expect(result.actualScore).toBe(1);
    expect(result.ratingChange).toBe(16);
    expect(result.ratingAfter).toBe(1016);
  });

  it('moves an equal-rated loser down by about half of K', () => {
    const result = calculator.calculate({
      ratingBefore: 1000,
      opponentRatingBefore: 1000,
      outcome: 'LOSS',
      score: 0,
      opponentScore: 0,
    });
    expect(result.actualScore).toBe(0);
    expect(result.ratingChange).toBe(-16);
    expect(result.ratingAfter).toBe(984);
  });

  it('leaves ratings unchanged for an equal-rated draw', () => {
    const result = calculator.calculate({
      ratingBefore: 1000,
      opponentRatingBefore: 1000,
      outcome: 'DRAW',
      score: 0,
      opponentScore: 0,
    });
    expect(result.actualScore).toBe(0.5);
    expect(result.ratingChange).toBe(0);
    expect(result.ratingAfter).toBe(1000);
  });

  it('rewards a stronger player less for winning and penalises more for losing', () => {
    const win = calculator.calculate({
      ratingBefore: 1400,
      opponentRatingBefore: 1000,
      outcome: 'WIN',
      score: 0,
      opponentScore: 0,
    });
    const loss = calculator.calculate({
      ratingBefore: 1400,
      opponentRatingBefore: 1000,
      outcome: 'LOSS',
      score: 0,
      opponentScore: 0,
    });
    expect(win.ratingChange).toBeLessThan(16);
    expect(win.ratingChange).toBeGreaterThan(0);
    expect(loss.ratingChange).toBeLessThan(-16);
  });

  it('rewards an underdog more for an upset', () => {
    const result = calculator.calculate({
      ratingBefore: 1000,
      opponentRatingBefore: 1400,
      outcome: 'WIN',
      score: 0,
      opponentScore: 0,
    });
    expect(result.ratingChange).toBeGreaterThan(16);
  });

  it('is symmetric: the points one player gains are close to the other\u2019s loss', () => {
    const winner = calculator.calculate({
      ratingBefore: 1200,
      opponentRatingBefore: 1300,
      outcome: 'WIN',
      score: 0,
      opponentScore: 0,
    });
    const loser = calculator.calculate({
      ratingBefore: 1300,
      opponentRatingBefore: 1200,
      outcome: 'LOSS',
      score: 0,
      opponentScore: 0,
    });
    expect(winner.ratingChange).toBeGreaterThan(0);
    expect(loser.ratingChange).toBeLessThan(0);
    expect(Math.abs(winner.ratingChange - Math.abs(loser.ratingChange))).toBeLessThanOrEqual(1);
  });

  it('scales the K-factor with a bounded score margin', () => {
    const narrow = calculator.calculate({
      ratingBefore: 1000,
      opponentRatingBefore: 1000,
      outcome: 'WIN',
      score: 1,
      opponentScore: 0,
    });
    const blowout = calculator.calculate({
      ratingBefore: 1000,
      opponentRatingBefore: 1000,
      outcome: 'WIN',
      score: 8,
      opponentScore: 0,
    });
    expect(blowout.effectiveK).toBeGreaterThan(narrow.effectiveK);
    expect(blowout.effectiveK).toBeLessThanOrEqual(DEFAULT_RATING_CONFIG.kFactor * 1.5);
  });

  it('disables the margin adjustment when configured to zero', () => {
    const config: RatingConfig = { ...DEFAULT_RATING_CONFIG, marginWeight: 0 };
    const calc = new RatingCalculator(config);
    const blowout = calc.calculate({
      ratingBefore: 1000,
      opponentRatingBefore: 1000,
      outcome: 'WIN',
      score: 9,
      opponentScore: 0,
    });
    expect(blowout.effectiveK).toBe(config.kFactor);
  });

  it('honours a configurable K-factor', () => {
    const calc = new RatingCalculator({ ...DEFAULT_RATING_CONFIG, kFactor: 64 });
    const result = calc.calculate({
      ratingBefore: 1000,
      opponentRatingBefore: 1000,
      outcome: 'WIN',
      score: 0,
      opponentScore: 0,
    });
    expect(result.ratingChange).toBe(32);
  });

  it('always returns whole-point ratings and changes', () => {
    const result = calculator.calculate({
      ratingBefore: 1234,
      opponentRatingBefore: 1379,
      outcome: 'WIN',
      score: 3,
      opponentScore: -2,
    });
    expect(Number.isInteger(result.ratingAfter)).toBe(true);
    expect(Number.isInteger(result.ratingChange)).toBe(true);
  });

  it('clamps to the configured floor and ceiling', () => {
    const low = calculator.calculate({
      ratingBefore: 100,
      opponentRatingBefore: 200,
      outcome: 'LOSS',
      score: 0,
      opponentScore: 5,
    });
    expect(low.ratingAfter).toBeGreaterThanOrEqual(DEFAULT_RATING_CONFIG.minRating);

    const high = calculator.calculate({
      ratingBefore: 4000,
      opponentRatingBefore: 3000,
      outcome: 'WIN',
      score: 5,
      opponentScore: 0,
    });
    expect(high.ratingAfter).toBeLessThanOrEqual(DEFAULT_RATING_CONFIG.maxRating);
  });

  it('is deterministic for the same inputs', () => {
    const input = {
      ratingBefore: 1500,
      opponentRatingBefore: 1480,
      outcome: 'WIN' as const,
      score: 2,
      opponentScore: 1,
    };
    expect(calculator.calculate(input)).toEqual(calculator.calculate(input));
  });

  it('maps ratings to the configured display tiers', () => {
    expect(calculator.tierFor(900)).toBe('BEGINNER');
    expect(calculator.tierFor(1250)).toBe('INTERMEDIATE');
    expect(calculator.tierFor(1450)).toBe('ADVANCED');
    expect(calculator.tierFor(1650)).toBe('EXPERT');
    expect(calculator.tierFor(1900)).toBe('ELITE');
  });
});
