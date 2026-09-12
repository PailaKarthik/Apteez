import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../../common/logger/app-logger';
import type { Env } from '../../config/env';
import { RedisService } from '../../redis/redis.service';
import { AuthService } from './auth.service';
import { GoogleOAuthService, isSafeNextPath } from './google-oauth.service';

describe('isSafeNextPath', () => {
  it.each([
    ['/profile', true],
    ['/', true],
    ['/contribute?draft=1', true],
    [undefined, false],
    ['', false],
    ['https://evil.example', false],
    ['//evil.example/x', false],
    ['/\\evil', false],
    ['javascript:alert(1)', false],
    ['/x:y', false],
  ])('classifies %p as %p', (input, expected) => {
    expect(isSafeNextPath(input)).toBe(expected);
  });
});

function makeService(
  env: Record<string, string | undefined>,
  redisStore = new Map<string, string>(),
) {
  const config = {
    get: (key: string) => env[key],
  } as unknown as ConfigService<Env, true>;
  const redis = {
    get: jest.fn(async (key: string) => redisStore.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      redisStore.set(key, value);
    }),
    del: jest.fn(async (key: string) => {
      redisStore.delete(key);
    }),
  } as unknown as RedisService;
  const auth = {
    findOrCreateOAuthUser: jest.fn(async () => ({ id: 'user-1' })),
    issueSession: jest.fn(async (user: { id: string }) => ({
      user,
      token: 'session-token',
      expiresAt: new Date(),
    })),
  } as unknown as AuthService;
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as AppLogger;
  const service = new GoogleOAuthService(config, redis, auth, logger);
  return { service, redis, auth };
}

const GOOGLE_ENV = {
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-secret',
  GOOGLE_CALLBACK_URL: 'http://localhost:3001/api/v1/auth/google/callback',
};

function mockGoogle(userinfo: Record<string, unknown>, tokenStatus = 200, infoStatus = 200): void {
  jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
    const target = String(url);
    if (target.includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'google-access' }), {
        status: tokenStatus,
      });
    }
    if (target.includes('userinfo')) {
      return new Response(JSON.stringify(userinfo), { status: infoStatus });
    }
    throw new Error(`unexpected fetch: ${target}`);
  });
}

describe('GoogleOAuthService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('refuses to start when unconfigured', async () => {
    const { service } = makeService({});
    await expect(service.begin('/profile')).rejects.toMatchObject({ code: 'OAUTH_NOT_CONFIGURED' });
    expect(service.isConfigured()).toBe(false);
  });

  it('builds an authorization URL with single-use state', async () => {
    const store = new Map<string, string>();
    const { service } = makeService(GOOGLE_ENV, store);
    const { url } = await service.begin('/profile');
    expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url).toContain('client_id=test-client-id');
    const state = new URL(url).searchParams.get('state');
    expect(state).toMatch(/^[0-9a-f]{64}$/);
    expect(store.has(`apteez:auth:oauth-state:${state}`)).toBe(true);
  });

  it('rejects callbacks with missing or replayed state', async () => {
    const { service } = makeService(GOOGLE_ENV);
    await expect(service.callback('code', undefined, {})).rejects.toMatchObject({
      code: 'INVALID_OAUTH',
    });
    await expect(service.callback('code', 'unknown-state', {})).rejects.toMatchObject({
      code: 'INVALID_OAUTH',
    });
  });

  it('links a verified Google identity and redirects to a safe path', async () => {
    const store = new Map<string, string>();
    const { service, auth } = makeService(GOOGLE_ENV, store);
    store.set('apteez:auth:oauth-state:state-1', JSON.stringify({ next: '/contribute' }));
    mockGoogle({ sub: 'google-123', email: 'Ada@Example.com', email_verified: true, name: 'Ada' });
    const result = await service.callback('auth-code', 'state-1', { ip: '127.0.0.1' });
    expect(auth.findOrCreateOAuthUser).toHaveBeenCalledWith({
      provider: 'google',
      providerUserId: 'google-123',
      email: 'ada@example.com',
      displayName: 'Ada',
    });
    expect(result.next).toBe('/contribute');
    expect(result.token).toBe('session-token');
    expect(store.has('apteez:auth:oauth-state:state-1')).toBe(false);
  });

  it('falls back to / for unsafe stored paths', async () => {
    const store = new Map<string, string>();
    const { service } = makeService(GOOGLE_ENV, store);
    store.set('apteez:auth:oauth-state:state-2', JSON.stringify({ next: 'https://evil.example' }));
    mockGoogle({ sub: 'google-123', email: 'a@example.com', email_verified: true });
    const result = await service.callback('auth-code', 'state-2', {});
    expect(result.next).toBe('/');
  });

  it('rejects unverified Google emails', async () => {
    const store = new Map<string, string>();
    const { service, auth } = makeService(GOOGLE_ENV, store);
    store.set('apteez:auth:oauth-state:state-3', JSON.stringify({ next: '/' }));
    mockGoogle({ sub: 'google-123', email: 'a@example.com', email_verified: false });
    await expect(service.callback('auth-code', 'state-3', {})).rejects.toMatchObject({
      code: 'INVALID_OAUTH',
    });
    expect(auth.findOrCreateOAuthUser).not.toHaveBeenCalled();
  });

  it('surfaces provider outages as safe errors without leaking bodies', async () => {
    const store = new Map<string, string>();
    const { service } = makeService(GOOGLE_ENV, store);
    store.set('apteez:auth:oauth-state:state-4', JSON.stringify({ next: '/' }));
    mockGoogle({}, 400);
    await expect(service.callback('auth-code', 'state-4', {})).rejects.toMatchObject({
      code: 'INVALID_OAUTH',
      statusCode: 400,
    });
  });
});
