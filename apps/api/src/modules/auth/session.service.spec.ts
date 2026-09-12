import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../../common/logger/app-logger';
import type { Env } from '../../config/env';
import { RedisService } from '../../redis/redis.service';
import { SessionService } from './session.service';

/** Minimal in-memory stand-in for the Redis surface SessionService uses. */
class FakeRedis {
  readonly strings = new Map<string, { value: string; expiresAt: number }>();
  readonly sets = new Map<string, Set<string>>();
  ttlOverride: number | null = null;
  readonly expiredKeys: string[] = [];

  private alive(key: string): boolean {
    const entry = this.strings.get(key);
    if (!entry) {
      return false;
    }
    if (entry.expiresAt <= Date.now()) {
      this.strings.delete(key);
      return false;
    }
    return true;
  }

  async get(key: string): Promise<string | null> {
    return this.alive(key) ? (this.strings.get(key)?.value ?? null) : null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.strings.set(key, {
      value,
      expiresAt: Date.now() + (ttlSeconds ?? 0) * 1000,
    });
  }

  async del(key: string): Promise<void> {
    this.strings.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.alive(key);
  }

  getClient(): unknown {
    // Capture the maps (never reassigned, only mutated) instead of `this`
    // so the plain client object stays independent of the fake instance.
    const { strings, sets, expiredKeys } = this;
    const self = { strings, sets, expiredKeys, ttlOverride: this.ttlOverride };
    return {
      sadd: async (key: string, member: string) => {
        const set = self.sets.get(key) ?? new Set<string>();
        set.add(member);
        self.sets.set(key, set);
        return 1;
      },
      srem: async (key: string, member: string) => {
        self.sets.get(key)?.delete(member);
        return 1;
      },
      smembers: async (key: string): Promise<string[]> => [...(self.sets.get(key) ?? [])],
      expire: async (key: string, seconds: number) => {
        self.expiredKeys.push(`${key}:${seconds}`);
        const entry = self.strings.get(key);
        if (entry) {
          entry.expiresAt = Date.now() + seconds * 1000;
        }
        return 1;
      },
      del: async (keys: string | string[]) => {
        const list = Array.isArray(keys) ? keys : [keys];
        for (const key of list) {
          self.strings.delete(key);
          self.sets.delete(key);
        }
        return list.length;
      },
      ttl: async () => self.ttlOverride ?? 1209600,
      incr: async (key: string) => {
        const raw = self.strings.get(key)?.value;
        const current = raw === undefined ? 0 : Number.parseInt(raw, 10) || 0;
        const next = current + 1;
        // Preserve an existing expiry like Redis INCR does.
        const entry = self.strings.get(key);
        self.strings.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? 0 });
        return next;
      },
    };
  }
}

function makeService(ttlSeconds = 1209600): { service: SessionService; fake: FakeRedis } {
  const fake = new FakeRedis();
  const redis = {
    get: (key: string) => fake.get(key),
    set: (key: string, value: string, ttl?: number) => fake.set(key, value, ttl),
    del: (key: string) => fake.del(key),
    exists: (key: string) => fake.exists(key),
    getClient: () => fake.getClient(),
  } as unknown as RedisService;
  const config = {
    get: (key: string) => ({ SESSION_TTL_SECONDS: ttlSeconds })[key],
  } as unknown as ConfigService<Env, true>;
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as AppLogger;
  return { service: new SessionService(redis, config, logger), fake };
}

describe('SessionService', () => {
  it('creates sessions resolvable exactly once per token', async () => {
    const { service } = makeService();
    const created = await service.createSession('user-1', { via: 'password' });
    expect(created.token).toMatch(/^[0-9a-f]{64}$/);
    const resolved = await service.resolve(created.token);
    expect(resolved?.userId).toBe('user-1');
    expect(resolved?.sessionId).toHaveLength(12);
  });

  it('rejects unknown, empty and oversized tokens', async () => {
    const { service } = makeService();
    await expect(service.resolve('nope')).resolves.toBeNull();
    await expect(service.resolve('')).resolves.toBeNull();
    await expect(service.resolve('x'.repeat(300))).resolves.toBeNull();
  });

  it('refreshes sessions whose TTL dropped below half', async () => {
    const { service, fake } = makeService(1000);
    const created = await service.createSession('user-1', { via: 'password' });
    fake.ttlOverride = 10;
    await expect(service.resolve(created.token)).resolves.not.toBeNull();
    expect(fake.expiredKeys.some((entry) => entry.endsWith(':1000'))).toBe(true);
  });

  it('revoke is idempotent and drops unknown tokens silently', async () => {
    const { service } = makeService();
    const created = await service.createSession('user-1', { via: 'password' });
    await service.revoke(created.token);
    await expect(service.resolve(created.token)).resolves.toBeNull();
    await expect(service.revoke(created.token)).resolves.toBeUndefined();
    await expect(service.revoke('unknown')).resolves.toBeUndefined();
  });

  it('revokeAllForUser burns every session and reports the count', async () => {
    const { service } = makeService();
    const first = await service.createSession('user-1', { via: 'password' });
    const second = await service.createSession('user-1', { via: 'password' });
    await expect(service.revokeAllForUser('user-1')).resolves.toBe(2);
    await expect(service.resolve(first.token)).resolves.toBeNull();
    await expect(service.resolve(second.token)).resolves.toBeNull();
    await expect(service.revokeAllForUser('user-1')).resolves.toBe(0);
  });

  it('tracks login budgets per account and clears them on success', async () => {
    const { service } = makeService();
    await expect(service.getFailedLoginCount('a@x.com')).resolves.toBe(0);
    await expect(service.recordFailedLogin('a@x.com', 3, 600)).resolves.toBe(2);
    await expect(service.recordFailedLogin('a@x.com', 3, 600)).resolves.toBe(1);
    await expect(service.recordFailedLogin('a@x.com', 3, 600)).resolves.toBe(0);
    await expect(service.getFailedLoginCount('a@x.com')).resolves.toBe(3);
    await service.clearLoginBudget('a@x.com');
    await expect(service.getFailedLoginCount('a@x.com')).resolves.toBe(0);
  });
});
