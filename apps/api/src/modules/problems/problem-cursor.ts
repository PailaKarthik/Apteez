import type { ProblemSortKey } from '@apteez/types';

export interface ProblemCursor {
  /** Last row's sort value: ISO date string for date sorts, number for rating. */
  value: string | number;
  id: string;
}

const UUID_PATTERN = /^[0-9a-fA-F-]{36}$/;

export function encodeProblemCursor(cursor: ProblemCursor): string {
  return Buffer.from(JSON.stringify({ v: cursor.value, i: cursor.id }), 'utf8').toString(
    'base64url',
  );
}

/**
 * Decodes an opaque cursor. Returns null for anything malformed — the caller
 * maps that to a structured VALIDATION_ERROR (never a 500).
 */
export function decodeProblemCursor(raw: string): ProblemCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      v?: unknown;
      i?: unknown;
    };
    if (typeof parsed.i !== 'string' || !UUID_PATTERN.test(parsed.i)) {
      return null;
    }
    if (typeof parsed.v !== 'string' && typeof parsed.v !== 'number') {
      return null;
    }
    return { value: parsed.v, id: parsed.i };
  } catch {
    return null;
  }
}

/** Cursors are sort-specific: a rating cursor is meaningless for date sorts. */
export function cursorMatchesSort(cursor: ProblemCursor, sort: ProblemSortKey): boolean {
  const expectsNumber = sort === 'rating_asc' || sort === 'rating_desc';
  if (expectsNumber) {
    return typeof cursor.value === 'number' && Number.isFinite(cursor.value);
  }
  return typeof cursor.value === 'string' && !Number.isNaN(Date.parse(cursor.value));
}
