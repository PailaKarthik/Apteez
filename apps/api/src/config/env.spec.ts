import { resolveRedisUrl, validateEnv } from './env';

describe('validateEnv', () => {
  const base = {
    DATABASE_URL: 'postgresql://apteez:apteez@localhost:5432/apteez',
    REDIS_URL: 'redis://localhost:6379',
  };

  it('applies defaults for a minimal valid environment', () => {
    const env = validateEnv({ ...base });
    expect(env.PORT).toBe(3001);
    expect(env.NODE_ENV).toBe('development');
    expect(env.STORAGE_PROVIDER).toBe('local');
    expect(env.THROTTLE_LIMIT).toBe(100);
  });

  it('fails fast when required variables are missing', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('requires a Redis URL from either variable', () => {
    const { REDIS_URL: _dropped, ...withoutRedis } = base;
    expect(() => validateEnv(withoutRedis)).toThrow(/UPSTASH_REDIS_URL/);
  });

  it('prefers the Upstash endpoint and validates the scheme', () => {
    const env = validateEnv({
      ...base,
      UPSTASH_REDIS_URL: 'rediss://default:token@host.upstash.io:6379',
    });
    expect(env.UPSTASH_REDIS_URL).toMatch(/^rediss:\/\//);
    expect(() => validateEnv({ ...base, REDIS_URL: 'https://host.upstash.io' })).toThrow(
      /redis:\/\//,
    );
  });

  it('requires S3 credentials when the s3 provider is selected', () => {
    expect(() => validateEnv({ ...base, STORAGE_PROVIDER: 's3' })).toThrow(/S3_BUCKET/);
  });

  it('accepts a fully-specified s3 configuration', () => {
    const env = validateEnv({
      ...base,
      STORAGE_PROVIDER: 's3',
      S3_ENDPOINT: 'https://s3.example.com',
      S3_BUCKET: 'apteez-dev',
      S3_ACCESS_KEY_ID: 'key',
      S3_SECRET_ACCESS_KEY: 'secret',
    });
    expect(env.STORAGE_PROVIDER).toBe('s3');
  });

  it('requires an endpoint when the s3 provider is selected', () => {
    expect(() =>
      validateEnv({
        ...base,
        STORAGE_PROVIDER: 's3',
        S3_BUCKET: 'apteez-dev',
        S3_ACCESS_KEY_ID: 'key',
        S3_SECRET_ACCESS_KEY: 'secret',
      }),
    ).toThrow(/S3_ENDPOINT/);
  });

  it('requires a real cookie secret in production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(/COOKIE_SECRET/);
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', COOKIE_SECRET: 'change-me-in-production' }),
    ).toThrow(/COOKIE_SECRET/);
    const env = validateEnv({ ...base, NODE_ENV: 'production', COOKIE_SECRET: 'a-strong-secret' });
    expect(env.NODE_ENV).toBe('production');
  });

  it('resolveRedisUrl prefers Upstash and throws when empty', () => {
    expect(resolveRedisUrl('rediss://upstash/x', 'redis://localhost:6379')).toBe(
      'rediss://upstash/x',
    );
    expect(resolveRedisUrl(undefined, 'redis://localhost:6379')).toBe('redis://localhost:6379');
    expect(() => resolveRedisUrl(undefined, undefined)).toThrow(/UPSTASH_REDIS_URL/);
  });

  it('treats empty dotenv lines as unset instead of failing or shadowing', () => {
    // Mirrors a real .env with fill-in-the-blank keys left empty.
    const env = validateEnv({
      ...base,
      UPSTASH_REDIS_URL: '',
      GOOGLE_CLIENT_ID: '',
      LLM_API_KEY: '',
      EMBEDDING_API_KEY: '',
    });
    expect(env.UPSTASH_REDIS_URL).toBeUndefined();
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(resolveRedisUrl(env.UPSTASH_REDIS_URL, env.REDIS_URL)).toBe('redis://localhost:6379');
  });
});
