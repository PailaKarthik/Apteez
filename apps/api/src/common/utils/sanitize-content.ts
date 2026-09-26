/**
 * Minimal server-side sanitizer for user-generated plain text.
 * The product renders user content as text (React escaping), never as raw
 * HTML — this helper strips script vectors before storage so a future
 * renderer or notification email cannot become a stored-XSS sink.
 * Not a full HTML sanitizer: HTML input is rejected, not cleaned.
 */

const DANGEROUS_PATTERNS: RegExp[] = [
  /<\s*script\b/i,
  /<\s*iframe\b/i,
  /<\s*object\b/i,
  /<\s*embed\b/i,
  /javascript\s*:/i,
  /on\w+\s*=/i,
];

export function containsActiveContent(value: string): boolean {
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(value));
}

/** Strip angle brackets and control chars; collapse whitespace. */
export function sanitizePlainText(value: string, maxLength?: number): string {
  // eslint-disable-next-line no-control-regex -- intentional control-char strip
  let out = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  out = out.replace(/[<>]/g, '');
  out = out.replace(/\s+/g, ' ').trim();
  if (maxLength !== undefined && maxLength > 0) {
    out = out.slice(0, maxLength);
  }
  return out;
}

/** Throw-friendly guard: returns true when the value is safe plain text. */
export function isSafePlainText(value: string): boolean {
  return !containsActiveContent(value);
}
