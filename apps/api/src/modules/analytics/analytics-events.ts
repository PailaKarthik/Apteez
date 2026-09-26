/**
 * Closed product-analytics vocabulary. Recorders may only use these names —
 * arbitrary client-defined events are rejected so dashboards never fill with
 * typos and spam. AI telemetry keeps its own table (`ai_usage_logs`) and
 * search keeps `search_events`; this vocabulary covers product milestones.
 */
export const ANALYTICS_EVENTS = [
  'auth.registered',
  'auth.login',
  'practice.submitted',
  'practice.solved',
  'favorites.added',
  'favorites.removed',
  'challenge.completed',
  'contest.submitted',
  'event.registered',
  'event.submitted',
  'learning.lesson_completed',
  'discussion.created',
  'discussion.reply_created',
  'discussion.reported',
  'contribution.submitted',
  'contribution.approved',
  'rewards.points_earned',
  'rewards.redeemed',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

/** Ordered lifecycle funnel: each stage's first occurrence per user. */
export const ANALYTICS_FUNNEL: AnalyticsEventName[] = [
  'auth.registered',
  'practice.submitted',
  'practice.solved',
  'challenge.completed',
  'contest.submitted',
  'event.registered',
  'contribution.submitted',
];

const SENSITIVE_KEY_PATTERN =
  /password|passwd|secret|token|cookie|authorization|set-cookie|api[-_]?key|private[-_]?key|answer|prompt/i;

/**
 * Bound and sanitize recorder-supplied metadata. Keeps ids/slugs/counts,
 * drops anything sensitive or oversized. Never throws.
 */
export function sanitizeMetadata(
  input: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input).slice(0, 12)) {
    if (typeof key !== 'string' || key.length === 0 || key.length > 64) {
      continue;
    }
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      continue;
    }
    if (typeof value === 'string') {
      out[key] = value.slice(0, 200);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = Number.isFinite(value) ? value : null;
    } else if (value === null || value === undefined) {
      out[key] = null;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}
