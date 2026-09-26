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

  it('rewards faster-than-median finishes with a bounded pace bonus', () => {
    const base = { ratingBefore: 1000, rank: 5, fieldSize: 20, fieldAverage: 1000 } as const;
    const fast = calculator.calculate({
      ...base,
      completionSeconds: 600,
      fieldMedianSeconds: 1200,
    });
    const median = calculator.calculate({
      ...base,
      completionSeconds: 1200,
      fieldMedianSeconds: 1200,
    });
    const slow = calculator.calculate({
      ...base,
      completionSeconds: 2400,
      fieldMedianSeconds: 1200,
    });
    expect(fast.speedBonus).toBeGreaterThan(0);
    expect(fast.speedBonus).toBeLessThanOrEqual(8);
    expect(median.speedBonus).toBe(0);
    expect(slow.speedBonus).toBeLessThan(0);
    expect(slow.speedBonus).toBeGreaterThanOrEqual(-8);
    expect(fast.ratingChange).toBeGreaterThan(median.ratingChange);
    expect(slow.ratingChange).toBeLessThan(median.ratingChange);
  });

  it('ignores pace when the data is missing or degenerate', () => {
    const base = { ratingBefore: 1000, rank: 5, fieldSize: 20, fieldAverage: 1000 } as const;
    expect(calculator.calculate(base).speedBonus).toBe(0);
    expect(
      calculator.calculate({ ...base, completionSeconds: 600, fieldMedianSeconds: 0 }).speedBonus,
    ).toBe(0);
    expect(
      calculator.calculate({ ...base, completionSeconds: 600, fieldMedianSeconds: null })
        .speedBonus,
    ).toBe(0);
    expect(
      calculator.calculate({ ratingBefore: 1000, rank: 1, fieldSize: 1, fieldAverage: 1000 })
        .speedBonus,
    ).toBe(0);
  });

  it('keeps rank + pace inside the per-contest clamp', () => {
    const extreme = calculator.calculate({
      ratingBefore: 100,
      rank: 1,
      fieldSize: 500,
      fieldAverage: 3000,
      completionSeconds: 1,
      fieldMedianSeconds: 3600,
    });
    expect(Math.abs(extreme.ratingChange)).toBeLessThanOrEqual(64);
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
