/**
 * Central log redaction. Applied to every AppLogger line (message + stack)
 * so a stray `logger.log({ headers })` or echoed connection string can never
 * ship credentials to the log aggregator. Rules:
 *
 * - Object keys matching a sensitive name are replaced with `[REDACTED]`
 *   (case-insensitive substring match; deep, cycle-safe, depth-capped).
 * - Raw strings are scrubbed for credentialed URLs (`://user:pass@`),
 *   bearer/basic auth headers, and `key=value` secrets in query strings.
 *
 * Deliberately conservative: display names, ids, routes and counts pass
 * through untouched. When in doubt about a new field, add its key here and
 * cover it in log-redact.spec.ts.
 */

// Note: `token` excludes the `prompt*`/`completion*` telemetry counters via
// lookbehind — counts stay readable while access/refresh/session tokens redact.
const SENSITIVE_KEY_PATTERN =
  /password|passwd|secret|(?<!prompt|completion)tokes?n|cookie|authorization|api[-_]?key|access[-_]?key|database[-_]?url|session|bearer|refresh|credential|private[-_]?key|set-cookie/i;

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 10;

function scrubString(text: string): string {
  return (
    text
      // Credentialed URLs: postgres://user:pass@host, https://key@host, ...
      .replace(/:\/\/[^/\s:@]+:[^/\s@]+@/g, '://' + REDACTED + '@')
      // Authorization headers echoed into logs.
      .replace(/\bBearer\s+[A-Za-z0-9\-._~+/=]+/g, 'Bearer ' + REDACTED)
      .replace(/\bBasic\s+[A-Za-z0-9+/=]+/g, 'Basic ' + REDACTED)
      // Query-string / form secrets: ?password=...&token=...
      .replace(
        /([?&](?:password|passwd|secret|token|api[_-]?key|access[_-]?key|session)=)[^&\s"'\\]*/gi,
        '$1' + REDACTED,
      )
  );
}

/** Scrub secrets from a free-form string. Idempotent. */
export function redactString(text: string): string {
  return scrubString(text);
}

/** Deep-clone `value` with sensitive keys replaced. Never throws. */
export function redactSecrets<T>(value: T, depth = 0): T {
  try {
    return redactInner(value, depth, new WeakSet());
  } catch {
    return REDACTED as unknown as T;
  }
}

function redactInner<T>(value: T, depth: number, seen: WeakSet<object>): T {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return scrubString(value) as unknown as T;
  }
  if (typeof value !== 'object') {
    return value;
  }
  if (depth >= MAX_DEPTH) {
    return REDACTED as unknown as T;
  }
  if (seen.has(value)) {
    return REDACTED as unknown as T;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((entry) => redactInner(entry, depth + 1, seen)) as unknown as T;
  }
  if (value instanceof Date || value instanceof RegExp) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactInner(entry, depth + 1, seen);
  }
  return out as unknown as T;
}
