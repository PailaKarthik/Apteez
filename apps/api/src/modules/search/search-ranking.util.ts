import { createHash } from 'node:crypto';

/**
 * Pure search helpers. The lexical ranking ladder lives here so it is
 * unit-testable without a database:
 *
 *   1. exact id/identifier match
 *   2. exact title match
 *   3. title prefix match
 *   4. full-text match (ts_rank)
 *   5. trigram similarity match
 *   6. topic / exam-tag match
 *
 * This is ordinary database search, not semantic retrieval. The future RAG
 * Similar Problems pipeline (embeddings + pgvector + rerank) sits behind
 * SimilarProblemService and never touches this ladder.
 */

/** Rank tiers mirrored by the SQL in SearchService.searchProblems. */
export const RANK_TIER = {
  EXACT_ID: 1000,
  EXACT_TITLE: 500,
  TITLE_PREFIX: 300,
  FULLTEXT_SCALE: 100,
  TRIGRAM_SCALE: 50,
} as const;

/** Minimum trigram similarity for a title to count as a partial match. */
export const TRIGRAM_THRESHOLD = 0.2;

/** Collapse whitespace and lowercase for stable hashing and prefix queries. */
export function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase();
}

export interface SearchCursor {
  /** First 16 hex chars of sha256 over the normalized query + filters. */
  h: string;
  /** Row offset into the deterministically ordered result set. */
  o: number;
}

/** Fingerprint binding a cursor to the exact query+filters that produced it. */
export function fingerprintQuery(parts: string): string {
  return createHash('sha256').update(parts).digest('hex').slice(0, 16);
}

export function encodeSearchCursor(cursor: SearchCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeSearchCursor(raw: string | undefined): SearchCursor | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as { h?: unknown }).h !== 'string' ||
      typeof (parsed as { o?: unknown }).o !== 'number' ||
      !Number.isInteger((parsed as { o: number }).o) ||
      (parsed as { o: number }).o < 0
    ) {
      return null;
    }
    return parsed as SearchCursor;
  } catch {
    return null;
  }
}

/** Canonical fingerprint input: normalized query plus every result-shaping filter. */
export function fingerprintInput(
  query: string,
  filters: Record<string, string | number | boolean | undefined>,
): string {
  const entries = Object.entries(filters)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  return `${normalizeQuery(query)}|${entries}`;
}
