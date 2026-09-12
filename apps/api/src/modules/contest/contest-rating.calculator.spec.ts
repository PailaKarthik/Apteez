import { ContestRatingCalculator } from './contest-rating.calculator';

describe('ContestRatingCalculator', () => {
  const calculator = new ContestRatingCalculator();

  it('rewards a winner and penalizes the last place symmetrically-ish', () => {
    const win = calculator.calculate({
      ratingBefore: 1000,
      rank: 1,
      fieldSize: 20,
      fieldAverage: 1000,
    });
    const loss = calculator.calculate({
      ratingBefore: 1000,
      rank: 20,
      fieldSize: 20,
      fieldAverage: 1000,
    });
    expect(win.ratingChange).toBeGreaterThan(0);
    expect(loss.ratingChange).toBeLessThan(0);
    expect(Math.abs(win.ratingChange)).toBe(Math.abs(loss.ratingChange));
  });

  it('leaves a mid-field finish near zero for an average player', () => {
    const mid = calculator.calculate({
      ratingBefore: 1000,
      rank: 10,
      fieldSize: 20,
      fieldAverage: 1000,
    });
    expect(Math.abs(mid.ratingChange)).toBeLessThanOrEqual(3);
  });

  it('rewards beating a stronger field more than a weaker one', () => {
    const strong = calculator.calculate({
      ratingBefore: 1000,
      rank: 1,
      fieldSize: 10,
      fieldAverage: 1400,
    });
    const weak = calculator.calculate({
      ratingBefore: 1000,
      rank: 1,
      fieldSize: 10,
      fieldAverage: 800,
    });
    expect(strong.ratingChange).toBeGreaterThan(weak.ratingChange);
  });

  it('clamps single-contest moves and the rating bounds', () => {
    const big = calculator.calculate({
      ratingBefore: 100,
      rank: 1,
      fieldSize: 500,
      fieldAverage: 3000,
    });
    expect(Math.abs(big.ratingChange)).toBeLessThanOrEqual(64);
    expect(big.ratingAfter).toBeGreaterThanOrEqual(100);
    const top = calculator.calculate({
      ratingBefore: 4000,
      rank: 1,
      fieldSize: 50,
      fieldAverage: 1000,
    });
    expect(top.ratingAfter).toBeLessThanOrEqual(4000);
  });

  it('is deterministic', () => {
    const input = { ratingBefore: 1234, rank: 3, fieldSize: 16, fieldAverage: 1300 } as const;
    expect(calculator.calculate(input)).toEqual(calculator.calculate(input));
  });

  it('maps ratings to tiers', () => {
    expect(calculator.tierFor(900)).toBe('BEGINNER');
    expect(calculator.tierFor(1500)).toBe('ADVANCED');
    expect(calculator.tierFor(1900)).toBe('ELITE');
  });
});
