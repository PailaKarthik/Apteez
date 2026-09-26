/**
 * Pure profile helpers. Timezone handling, streak runs and weak-area scoring
 * live here so they are unit-testable without a database.
 */

/** YYYY-MM-DD calendar key of `date` in `timeZone` (defaults to UTC). */
export function dayKeyInTimezone(date: Date, timeZone?: string | null): string {
  const tz = timeZone && timeZone.trim().length > 0 ? timeZone : 'UTC';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Add (or subtract) whole calendar days to a YYYY-MM-DD key. */
export function shiftDayKey(dayKey: string, deltaDays: number): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  const base = new Date(Date.UTC(year, month - 1, day));
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return base.toISOString().slice(0, 10);
}

/** Throws when `timeZone` is not a valid IANA identifier. */
export function assertValidTimezone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    throw new Error(`Unknown timezone: ${timeZone}`);
  }
}

export interface StreakResult {
  current: number;
  longest: number;
  lastActiveDate: string | null;
  activeToday: boolean;
}

/**
 * Consecutive-day run ending at `todayKey`. `activeDayKeys` is the set of
 * qualifying days (one entry per day regardless of action count). A streak
 * stays alive when yesterday was active even if today is not over yet.
 */
export function computeStreak(
  activeDayKeys: Set<string> | string[],
  todayKey: string,
): StreakResult {
  const active = activeDayKeys instanceof Set ? activeDayKeys : new Set(activeDayKeys);
  if (active.size === 0) {
    return { current: 0, longest: 0, lastActiveDate: null, activeToday: false };
  }
  const sorted = [...active].sort();
  const lastActiveDate = sorted[sorted.length - 1];
  // Longest historical run.
  let longest = 1;
  let run = 1;
  for (let index = 1; index < sorted.length; index += 1) {
    if (shiftDayKey(sorted[index - 1], 1) === sorted[index]) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 1;
    }
  }
  // Current run anchored at today (or yesterday when today is still open).
  const anchor = active.has(todayKey) ? todayKey : shiftDayKey(todayKey, -1);
  let current = 0;
  if (active.has(anchor)) {
    let cursor = anchor;
    while (active.has(cursor)) {
      current += 1;
      cursor = shiftDayKey(cursor, -1);
    }
  }
  return { current, longest, lastActiveDate, activeToday: active.has(todayKey) };
}

export interface WeakAreaInput {
  topicSlug: string;
  topicName: string;
  domainSlug: string;
  domainName: string;
  attempts: number;
  accuracy: number | null;
  avgTimeSeconds: number | null;
  recentTrend: number | null;
  globalAvgTimeSeconds: number | null;
}

/** Minimum attempts before a topic may be labeled weak. */
export const WEAK_AREA_MIN_ATTEMPTS = 8;

export interface WeakAreaScore {
  eligible: boolean;
  severity: 'high' | 'medium' | 'low';
  reason: string;
}

/**
 * Deterministic weak-area classifier. Accuracy alone never decides: attempt
 * volume, recency trend, difficulty-agnostic slowness and consistency all
 * contribute. Below-threshold topics are ineligible, never "weak".
 */
export function scoreWeakArea(input: WeakAreaInput): WeakAreaScore {
  if (input.attempts < WEAK_AREA_MIN_ATTEMPTS || input.accuracy === null) {
    return {
      eligible: false,
      severity: 'low',
      reason: `Only ${input.attempts} attempts — needs at least ${WEAK_AREA_MIN_ATTEMPTS} for a reliable signal.`,
    };
  }
  let score = 0;
  const signals: string[] = [];
  if (input.accuracy < 0.5) {
    score += 3;
    signals.push(`accuracy ${formatPercent(input.accuracy)} is below 50%`);
  } else if (input.accuracy < 0.65) {
    score += 2;
    signals.push(`accuracy ${formatPercent(input.accuracy)} is below 65%`);
  } else if (input.accuracy < 0.75) {
    score += 1;
    signals.push(`accuracy ${formatPercent(input.accuracy)} trails your stronger topics`);
  }
  if (input.recentTrend !== null && input.recentTrend < -10) {
    score += 2;
    signals.push(`recent form down ${Math.abs(Math.round(input.recentTrend))} pts`);
  } else if (input.recentTrend !== null && input.recentTrend < 0) {
    score += 1;
    signals.push('recent form slipping');
  }
  if (
    input.avgTimeSeconds !== null &&
    input.globalAvgTimeSeconds !== null &&
    input.avgTimeSeconds > input.globalAvgTimeSeconds * 1.5
  ) {
    score += 1;
    signals.push('solving time well above your average');
  }
  if (score >= 4) {
    return { eligible: true, severity: 'high', reason: capitalize(signals.join('; ') + '.') };
  }
  if (score >= 2) {
    return { eligible: true, severity: 'medium', reason: capitalize(signals.join('; ') + '.') };
  }
  return {
    eligible: false,
    severity: 'low',
    reason: `Holding at ${formatPercent(input.accuracy)} over ${input.attempts} attempts — no action needed.`,
  };
}

/** Whole-percentage accuracy from solved/attempted counts. */
export function accuracyOf(solved: number, attempted: number): number | null {
  if (attempted <= 0) {
    return null;
  }
  return Math.round((solved / attempted) * 1000) / 10;
}

/** Mean of non-null durations, rounded to whole seconds. */
export function averageOf(values: Array<number | null | undefined>): number | null {
  const present = values.filter(
    (value): value is number => typeof value === 'number' && value >= 0,
  );
  if (present.length === 0) {
    return null;
  }
  return Math.round(present.reduce((sum, value) => sum + value, 0) / present.length);
}

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}
