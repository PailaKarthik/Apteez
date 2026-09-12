import { validateEnv } from './env';

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

  it('requires S3 credentials when the s3 provider is selected', () => {
    expect(() => validateEnv({ ...base, STORAGE_PROVIDER: 's3' })).toThrow(/S3_BUCKET/);
  });

  it('accepts a fully-specified s3 configuration', () => {
    const env = validateEnv({
      ...base,
      STORAGE_PROVIDER: 's3',
      S3_BUCKET: 'apteez-dev',
      S3_ACCESS_KEY_ID: 'key',
      S3_SECRET_ACCESS_KEY: 'secret',
    });
    expect(env.STORAGE_PROVIDER).toBe('s3');
  });
});
