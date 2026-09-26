import { describe, expect, it } from 'vitest';
import { contestsListPath } from '../use-contests';

describe('contestsListPath', () => {
  it('builds a bare path with no filters', () => {
    expect(contestsListPath()).toBe('/contests');
    expect(contestsListPath({})).toBe('/contests');
  });

  it('serializes filters and pagination, skipping empties', () => {
    const path = contestsListPath({ phase: 'live', page: 2, pageSize: 12 });
    expect(path).toContain('phase=live');
    expect(path).toContain('page=2');
    expect(path).toContain('pageSize=12');
    expect(path).not.toContain('difficulty=');
  });
});
