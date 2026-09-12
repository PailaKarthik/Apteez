import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../../common/logger/app-logger';
import type { Env } from '../../config/env';
import { redisKeys } from '../../redis/redis-keys';
import { RedisService } from '../../redis/redis.service';

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
  /** How the session was established (audit aid, not a trust signal). */
  via: 'password' | 'oauth' | 'bearer';
}

export interface CreatedSession {
  /** Raw opaque token. Shown to its owner exactly once (the cookie). */
  token: string;
  expiresAt: Date;
}

export interface ResolvedSession {
  userId: string;
  /** Redis key fingerprint for audit logs (never the raw token). */
  sessionId: string;
}

/**
 * Opaque server-side sessions in Redis. Only a random token ever reaches
 * the client (HTTP-only cookie, or `Authorization: Bearer` for the future
 * mobile app); Redis stores the SHA-256 hash, so a cache dump alone
 * cannot impersonate anyone. Revocation is a single DEL — logout and
 * disable flows take effect immediately.
 */
@Injectable()
export class SessionService {
  private readonly ttlSeconds: number;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService<Env, true>,
    private readonly logger: AppLogger,
  ) {
    this.ttlSeconds = this.config.get('SESSION_TTL_SECONDS', { infer: true });
  }

  private static hash(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private sessionKey(hash: string): string {
    return redisKeys.session(hash);
  }

  private userIndexKey(userId: string): string {
    return redisKeys.sessionUserIndex(userId);
  }

  async createSession(userId: string, meta: SessionMeta): Promise<CreatedSession> {
    const token = randomBytes(32).toString('hex');
    const hash = SessionService.hash(token);
    const record = JSON.stringify({
      userId,
      createdAt: new Date().toISOString(),
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 256),
      via: meta.via,
    });
    const client = this.redis.getClient();
    await this.redis.set(this.sessionKey(hash), record, this.ttlSeconds);
    await client.sadd(this.userIndexKey(userId), hash);
    await client.expire(this.userIndexKey(userId), this.ttlSeconds);
    return { token, expiresAt: new Date(Date.now() + this.ttlSeconds * 1000) };
  }

  async resolve(token: string): Promise<ResolvedSession | null> {
    if (!token || token.length > 256) {
      return null;
    }
    const hash = SessionService.hash(token);
    const key = this.sessionKey(hash);
    const raw = await this.redis.get(key);
    if (!raw) {
      return null;
    }
    let parsed: { userId?: unknown };
    try {
      parsed = JSON.parse(raw) as { userId?: unknown };
    } catch {
      await this.redis.del(key);
      return null;
    }
    if (typeof parsed.userId !== 'string') {
      await this.redis.del(key);
      return null;
    }
    // Sliding refresh: active sessions stay alive without re-login.
    const ttl = await this.redis.getClient().ttl(key);
    if (ttl > 0 && ttl < this.ttlSeconds / 2) {
      await this.redis.getClient().expire(key, this.ttlSeconds);
    }
    return { userId: parsed.userId, sessionId: hash.slice(0, 12) };
  }

  /** Idempotent: revoking twice (or a forged token) is still a success. */
  async revoke(token: string): Promise<void> {
    if (!token || token.length > 256) {
      return;
    }
    const hash = SessionService.hash(token);
    const raw = await this.redis.get(this.sessionKey(hash));
    await this.redis.del(this.sessionKey(hash));
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { userId?: unknown };
        if (typeof parsed.userId === 'string') {
          await this.redis.getClient().srem(this.userIndexKey(parsed.userId), hash);
        }
      } catch {
        this.logger.warn('Dropping malformed session record during revoke', 'Auth');
      }
    }
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const client = this.redis.getClient();
    const hashes = await client.smembers(this.userIndexKey(userId));
    if (hashes.length > 0) {
      await client.del(hashes.map((hash) => this.sessionKey(hash)));
    }
    await client.del(this.userIndexKey(userId));
    return hashes.length;
  }

  // ── Login-attempt budget (per-account brute-force protection) ──────────

  private attemptKey(emailLower: string): string {
    return redisKeys.loginAttempt(createHash('sha256').update(emailLower, 'utf8').digest('hex'));
  }

  /** Current failed-login count inside the window (0 when clean/expired). */
  async getFailedLoginCount(emailLower: string): Promise<number> {
    const raw = await this.redis.get(this.attemptKey(emailLower));
    const count = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(count) && count > 0 ? count : 0;
  }

  /**
   * Records a failed login. Returns remaining attempts before lockout, or
   * 0 when the budget is exhausted (caller must reject with 429).
   */
  async recordFailedLogin(
    emailLower: string,
    maxAttempts: number,
    windowSeconds: number,
  ): Promise<number> {
    const key = this.attemptKey(emailLower);
    const count = await this.redis.getClient().incr(key);
    if (count === 1) {
      await this.redis.getClient().expire(key, windowSeconds);
    }
    return Math.max(0, maxAttempts - count);
  }

  async clearLoginBudget(emailLower: string): Promise<void> {
    await this.redis.del(this.attemptKey(emailLower));
  }
}
