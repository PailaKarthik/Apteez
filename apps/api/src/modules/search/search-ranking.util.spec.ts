import {
  RANK_TIER,
  TRIGRAM_THRESHOLD,
  decodeSearchCursor,
  encodeSearchCursor,
  fingerprintInput,
  fingerprintQuery,
  normalizeQuery,
} from './search-ranking.util';

describe('search ranking ladder', () => {
  it('keeps the documented priority order', () => {
    expect(RANK_TIER.EXACT_ID).toBeGreaterThan(RANK_TIER.EXACT_TITLE);
    expect(RANK_TIER.EXACT_TITLE).toBeGreaterThan(RANK_TIER.TITLE_PREFIX);
    expect(RANK_TIER.TITLE_PREFIX).toBeGreaterThan(RANK_TIER.FULLTEXT_SCALE);
    expect(RANK_TIER.FULLTEXT_SCALE).toBeGreaterThan(RANK_TIER.TRIGRAM_SCALE);
    expect(TRIGRAM_THRESHOLD).toBeGreaterThan(0);
  });

  it('normalizes queries for stable hashing', () => {
    expect(normalizeQuery('  Time   &  Work ')).toBe('time & work');
    expect(fingerprintInput('Time & Work', {})).toBe(fingerprintInput('time & work', {}));
  });

  it('binds fingerprints to every result-shaping filter', () => {
    const base = fingerprintInput('algebra', { sort: 'relevance', limit: 20 });
    expect(fingerprintInput('algebra', { sort: 'newest', limit: 20 })).not.toBe(base);
    expect(fingerprintInput('algebra', { sort: 'relevance', limit: 10 })).not.toBe(base);
    expect(fingerprintInput('algebra', { sort: 'relevance', limit: 20 })).toBe(base);
  });
});

describe('search cursors', () => {
  it('round-trips offset cursors', () => {
    const cursor = encodeSearchCursor({ h: 'abc123', o: 40 });
    expect(decodeSearchCursor(cursor)).toEqual({ h: 'abc123', o: 40 });
  });

  it('rejects tampered, foreign and malformed cursors', () => {
    expect(decodeSearchCursor(undefined)).toBeNull();
    expect(decodeSearchCursor('not-base64!!')).toBeNull();
    expect(decodeSearchCursor(Buffer.from('{}').toString('base64url'))).toBeNull();
    expect(decodeSearchCursor(encodeSearchCursor({ h: 'x', o: -5 }))).toBeNull();
    expect(decodeSearchCursor(encodeSearchCursor({ h: 'x', o: 1.5 }))).toBeNull();
    expect(fingerprintQuery('abc')).toHaveLength(16);
  });
});
