import { redactSecrets, redactString } from './log-redact';

describe('redactString', () => {
  it('scrubs credentialed URLs', () => {
    expect(redactString('connect postgresql://admin:s3cret@db:5432/app failed')).toBe(
      'connect postgresql://[REDACTED]@db:5432/app failed',
    );
    expect(redactString('plain https://example.com/path stays')).toBe(
      'plain https://example.com/path stays',
    );
  });

  it('scrubs bearer and basic credentials', () => {
    expect(redactString('auth Bearer abcdef12345-._~ rest')).toBe('auth Bearer [REDACTED] rest');
    expect(redactString('auth Basic dXNlcjpwYXNz rest')).toBe('auth Basic [REDACTED] rest');
  });

  it('scrubs query-string secrets', () => {
    expect(redactString('/cb?code=x&token=abc123&next=/home')).toBe(
      '/cb?code=x&token=[REDACTED]&next=/home',
    );
  });

  it('leaves ordinary text untouched', () => {
    const text = 'GET /problems?limit=5 -> 200 (12ms) user=u1';
    expect(redactString(text)).toBe(text);
  });
});

describe('redactSecrets', () => {
  it('redacts sensitive keys and keeps telemetry counters', () => {
    const out = redactSecrets({
      password: 'hunter2',
      apiKey: 'sk-live-1',
      accessToken: 'tok',
      sessionCookie: 'abc',
      authorization: 'Bearer x',
      promptTokens: 150,
      completionTokens: 40,
      userId: 'u1',
      nested: { refreshToken: 'r', limit: 20 },
    });
    expect(out).toEqual({
      password: '[REDACTED]',
      apiKey: '[REDACTED]',
      accessToken: '[REDACTED]',
      sessionCookie: '[REDACTED]',
      authorization: '[REDACTED]',
      promptTokens: 150,
      completionTokens: 40,
      userId: 'u1',
      nested: { refreshToken: '[REDACTED]', limit: 20 },
    });
  });

  it('handles arrays, cycles and depth without throwing', () => {
    const cyclic: Record<string, unknown> = { password: 'x' };
    cyclic.self = cyclic;
    const out = redactSecrets({ items: [cyclic, 'Bearer abc'] });
    expect(out.items[0]).toEqual({ password: '[REDACTED]', self: '[REDACTED]' });
    expect(out.items[1]).toBe('Bearer [REDACTED]');
  });

  it('passes through dates and primitives', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    expect(redactSecrets({ at: date, count: 3 })).toEqual({ at: date, count: 3 });
  });
});
