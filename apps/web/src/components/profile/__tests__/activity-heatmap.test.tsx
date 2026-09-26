import { describe, expect, it } from 'vitest';
import { heatLevel } from '../activity-heatmap';

describe('heatLevel', () => {
  it('buckets counts into five stable intensity levels', () => {
    expect(heatLevel(0)).toBe(0);
    expect(heatLevel(-3)).toBe(0);
    expect(heatLevel(1)).toBe(1);
    expect(heatLevel(2)).toBe(1);
    expect(heatLevel(4)).toBe(2);
    expect(heatLevel(7)).toBe(3);
    expect(heatLevel(8)).toBe(4);
    expect(heatLevel(500)).toBe(4);
  });
});
