import { describe, expect, it } from 'vitest';
import { canRedeem } from '../use-rewards';

describe('canRedeem', () => {
  const reward = { pointsCost: 500, stockQuantity: 3, isActive: true };

  it('allows redemption with sufficient balance and stock', () => {
    expect(canRedeem(500, reward)).toEqual({ ok: true, reason: null });
    expect(canRedeem(5000, reward)).toEqual({ ok: true, reason: null });
  });

  it('blocks insufficient balance, stockouts and inactive rewards', () => {
    expect(canRedeem(499, reward)).toEqual({ ok: false, reason: 'Not enough points' });
    expect(canRedeem(500, { ...reward, stockQuantity: 0 })).toEqual({
      ok: false,
      reason: 'Out of stock',
    });
    expect(canRedeem(5000, { ...reward, isActive: false })).toEqual({
      ok: false,
      reason: 'Unavailable',
    });
  });

  it('treats null stock as unlimited', () => {
    expect(canRedeem(500, { ...reward, stockQuantity: null })).toEqual({ ok: true, reason: null });
  });
});
