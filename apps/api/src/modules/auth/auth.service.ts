import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@apteez/database';
import type { LoginInput, RegisterInput } from '@apteez/validation';
import { AppError } from '../../common/errors/app-error';
import { AppLogger } from '../../common/logger/app-logger';
import type { Env } from '../../config/env';
import { redisKeys } from '../../redis/redis-keys';
import { RedisService } from '../../redis/redis.service';
import { PasswordService } from './password.service';
import { SessionService, type SessionMeta } from './session.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { UsersService, type UserAuthProfile } from '../users/users.service';
import { EmailService } from '../email/email.service';
import {
  AccountDisabledError,
  AccountExistsError,
  EmailNotConfiguredError,
  InvalidCredentialsError,
  InvalidEmailOtpError,
  SessionExpiredError,
} from './auth.errors';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export interface AuthenticatedSession {
  user: UserAuthProfile;
  token: string;
  expiresAt: Date;
}

/**
 * Authentication workflows. Owns credential checks, session issuance and
 * OAuth provisioning; user persistence stays in UsersService and password
 * mathematics in PasswordService.
 *
 * Enumeration posture: unknown accounts, wrong passwords and (for
 * wrong-password attempts) disabled accounts all surface as the identical
 * INVALID_CREDENTIALS shape. Only a *correct* password on a disabled
 * account yields ACCOUNT_DISABLED.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService<Env, true>,
    private readonly logger: AppLogger,
    private readonly analytics: AnalyticsService,
    private readonly redis: RedisService,
    private readonly email: EmailService,
  ) {}

  async register(input: RegisterInput, meta: RequestMeta): Promise<AuthenticatedSession> {
    const email = input.email.toLowerCase();
    const existing = await this.users.findByEmailOrUsername(email, input.username);
    if (existing) {
      this.logger.warn(
        `auth.register rejected: duplicate account email=${email} ip=${meta.ip ?? '?'}`,
        'Auth',
      );
      throw new AccountExistsError();
    }
    let user;
    try {
      user = await this.users.createUser({
        email,
        username: input.username,
        displayName: input.displayName,
        passwordHash: await this.passwords.hash(input.password),
      });
    } catch (error) {
      // Registration race backstop: the CITEXT uniques are authoritative.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.warn(`auth.register race absorbed email=${email} ip=${meta.ip ?? '?'}`, 'Auth');
        throw new AccountExistsError();
      }
      throw error;
    }
    const profile = await this.requireAuthProfile(user.id);
    this.logger.log(`auth.register userId=${user.id} email=${email} ip=${meta.ip ?? '?'}`, 'Auth');
    void this.analytics.record('auth.registered', { userId: user.id });
    return this.issueSession(profile, { ...meta, via: 'password' });
  }

  async login(input: LoginInput, meta: RequestMeta): Promise<AuthenticatedSession> {
    const email = input.email.toLowerCase();
    const maxAttempts = this.config.get('LOGIN_MAX_ATTEMPTS', { infer: true });
    const windowSeconds = this.config.get('LOGIN_ATTEMPT_WINDOW_SECONDS', { infer: true });
    const failedAttempts = await this.sessions.getFailedLoginCount(email);
    if (failedAttempts >= maxAttempts) {
      this.logger.warn(
        `auth.login throttled email=${email} ip=${meta.ip ?? '?'} (budget exhausted)`,
        'Auth',
      );
      throw new AppError('RATE_LIMITED', 'Too many attempts. Try again later.', 429);
    }
    const user = await this.users.findByEmail(email);
    const valid = user?.passwordHash
      ? await this.passwords.verify(input.password, user.passwordHash)
      : false;
    if (!user || !valid) {
      // Uniform shape: only the NEXT request learns about the lockout (429
      // via the pre-check above), so failures never hint at budget state.
      const left = await this.sessions.recordFailedLogin(email, maxAttempts, windowSeconds);
      this.logger.warn(
        `auth.login failed email=${email} ip=${meta.ip ?? '?'} attemptsLeft=${left}`,
        'Auth',
      );
      throw new InvalidCredentialsError();
    }
    if (!user.isActive) {
      this.logger.warn(`auth.login disabled userId=${user.id} ip=${meta.ip ?? '?'}`, 'Auth');
      throw new AccountDisabledError();
    }
    await this.sessions.clearLoginBudget(email);
    const profile = await this.requireAuthProfile(user.id);
    this.logger.log(`auth.login userId=${user.id} ip=${meta.ip ?? '?'}`, 'Auth');
    void this.analytics.record('auth.login', { userId: user.id });
    return this.issueSession(profile, { ...meta, via: 'password' });
  }

  /** Idempotent: revoking an unknown/expired token still succeeds. */
  async logout(token: string | undefined, meta: RequestMeta, userId?: string): Promise<void> {
    if (token) {
      await this.sessions.revoke(token);
    }
    this.logger.log(`auth.logout userId=${userId ?? '?'} ip=${meta.ip ?? '?'}`, 'Auth');
  }

  async getMe(userId: string, token?: string): Promise<UserAuthProfile> {
    const profile = await this.users.findAuthProfile(userId);
    if (!profile) {
      if (token) {
        await this.sessions.revoke(token);
      }
      throw new SessionExpiredError();
    }
    if (!profile.isActive) {
      throw new AccountDisabledError();
    }
    return profile;
  }

  /** Shared session issuance for password + OAuth flows. */
  async issueSession(profile: UserAuthProfile, meta: SessionMeta): Promise<AuthenticatedSession> {
    const { token, expiresAt } = await this.sessions.createSession(profile.id, meta);
    return { user: profile, token, expiresAt };
  }

  // ── Email OTP verification ────────────────────────────────────────────
  // 6-digit codes, sha256-hashed at rest in Redis, 10-minute TTL, max 5
  // verify attempts per code. Registration stays usable when the mailer is
  // unconfigured (best-effort send); explicit requests fail loudly instead.

  private static readonly OTP_TTL_SECONDS = 600;
  private static readonly OTP_MAX_ATTEMPTS = 5;

  private static hashOtp(code: string): string {
    return createHash('sha256').update(code, 'utf8').digest('hex');
  }

  /** Whether the mailer can currently deliver (operator-provided key). */
  emailVerificationAvailable(): boolean {
    return this.email.isConfigured();
  }

  /**
   * Best-effort OTP dispatch used by registration: never fails signup.
   * Returns whether an email actually left the building.
   */
  async sendWelcomeOtp(userId: string): Promise<{ sent: boolean }> {
    try {
      const result = await this.requestEmailOtp(userId);
      return { sent: result.sent };
    } catch (error) {
      this.logger.warn(
        `auth.welcome-otp skipped userId=${userId} ${error instanceof Error ? error.message : String(error)}`,
        'Auth',
      );
      return { sent: false };
    }
  }

  /** Issue a fresh code and email it. Throws when already verified or unconfigured. */
  async requestEmailOtp(userId: string): Promise<{ sent: boolean; verified: boolean }> {
    const account = await this.users.findById(userId);
    if (!account) {
      throw new SessionExpiredError();
    }
    if (account.emailVerified) {
      return { sent: false, verified: true };
    }
    if (!this.email.isConfigured()) {
      throw new EmailNotConfiguredError();
    }
    const code = String(randomInt(100_000, 1_000_000));
    await this.redis.set(
      redisKeys.emailOtp(userId),
      JSON.stringify({ hash: AuthService.hashOtp(code), attempts: 0 }),
      AuthService.OTP_TTL_SECONDS,
    );
    await this.email.sendVerificationCode(account.email, account.displayName, code);
    this.logger.log(`auth.otp.sent userId=${userId}`, 'Auth');
    return { sent: true, verified: false };
  }

  /** Consume a code: single-use, attempt-capped, constant-time compared. */
  async verifyEmailOtp(userId: string, code: string): Promise<UserAuthProfile> {
    const key = redisKeys.emailOtp(userId);
    const raw = await this.redis.get(key);
    if (!raw) {
      throw new InvalidEmailOtpError('That code has expired. Request a new one.');
    }
    let record: { hash?: unknown; attempts?: unknown };
    try {
      record = JSON.parse(raw) as { hash?: unknown; attempts?: unknown };
    } catch {
      await this.redis.del(key);
      throw new InvalidEmailOtpError('That code has expired. Request a new one.');
    }
    const attempts = typeof record.attempts === 'number' ? record.attempts : 0;
    if (attempts >= AuthService.OTP_MAX_ATTEMPTS || typeof record.hash !== 'string') {
      await this.redis.del(key);
      throw new InvalidEmailOtpError('Too many wrong attempts. Request a new code.');
    }
    const expected = Buffer.from(record.hash, 'hex');
    const actual = Buffer.from(AuthService.hashOtp(code.trim()), 'hex');
    const match = expected.length === actual.length && expected.length > 0 && timingSafeEqual(expected, actual);
    if (!match) {
      const left = AuthService.OTP_MAX_ATTEMPTS - attempts - 1;
      const ttl = await this.redis.ttl(key);
      await this.redis.set(
        key,
        JSON.stringify({ hash: record.hash, attempts: attempts + 1 }),
        ttl > 0 ? ttl : AuthService.OTP_TTL_SECONDS,
      );
      throw new InvalidEmailOtpError(
        left > 0
          ? `That code is incorrect. ${left} attempt${left === 1 ? '' : 's'} left.`
          : 'That code is incorrect. Request a new one.',
      );
    }
    await this.redis.del(key);
    await this.users.markEmailVerified(userId);
    this.logger.log(`auth.otp.verified userId=${userId}`, 'Auth');
    return this.requireAuthProfile(userId);
  }

  /**
   * Find-or-create for verified OAuth identities. Links by
   * (provider, providerUserId) first — never by email alone — then falls
   * back to linking a verified-email account, else provisions a new user.
   */
  async findOrCreateOAuthUser(input: {
    provider: string;
    providerUserId: string;
    email: string;
    displayName: string;
  }): Promise<UserAuthProfile> {
    const { provider, providerUserId, email } = input;
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await this.users.findIdentity(provider, providerUserId);
    if (existing) {
      const profile = await this.requireAuthProfile(existing.userId);
      this.logger.log(`auth.oauth.linked provider=${provider} userId=${existing.userId}`, 'Auth');
      return profile;
    }
    const byEmail = await this.users.findByEmail(normalizedEmail);
    if (byEmail) {
      await this.users.linkIdentity({
        userId: byEmail.id,
        provider,
        providerUserId,
        email: normalizedEmail,
      });
      // Google proved ownership of this address — record it.
      await this.users.markEmailVerified(byEmail.id);
      this.logger.log(`auth.oauth.linked provider=${provider} userId=${byEmail.id}`, 'Auth');
      return this.requireAuthProfile(byEmail.id);
    }
    const username = await this.generateUsername(
      normalizedEmail.split('@')[0] ?? 'user',
    );
    try {
      const user = await this.users.createUser({
        email: normalizedEmail,
        username,
        displayName: input.displayName,
        passwordHash: null,
        emailVerified: new Date(),
      });
      await this.users.linkIdentity({
        userId: user.id,
        provider,
        providerUserId,
        email: normalizedEmail,
      });
      this.logger.log(`auth.oauth.provisioned provider=${provider} userId=${user.id}`, 'Auth');
      return this.requireAuthProfile(user.id);
    } catch (error) {
      // Race backstop: two concurrent Google callbacks (or a retry after a
      // half-completed provision) hit the CITEXT uniques. Re-read the winner
      // instead of leaking a Prisma P2002 as a 500 JSON page.
      // Transient pooler failures (P2028 transaction loss, P1001/P1017
      // connectivity on the Neon PgBouncer pooler) get one immediate retry:
      // createUser is idempotent step-by-step (upserts), so re-running
      // converges instead of stranding the signup.
      const code =
        error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
      if (code === 'P2002') {
        this.logger.warn(
          `auth.oauth race absorbed provider=${provider} email=${normalizedEmail}`,
          'Auth',
        );
        const winner =
          (await this.users.findIdentity(provider, providerUserId)) ??
          (await this.users.findByEmail(normalizedEmail));
        if (winner) {
          const userId = 'userId' in winner ? winner.userId : winner.id;
          // Ensure the identity link exists for email-winner path.
          if (!('userId' in winner)) {
            await this.users.linkIdentity({
              userId: winner.id,
              provider,
              providerUserId,
              email: normalizedEmail,
            });
            await this.users.markEmailVerified(winner.id);
          }
          return this.requireAuthProfile(userId);
        }
      }
      if (code === 'P2028' || code === 'P1001' || code === 'P1017') {
        this.logger.warn(
          `auth.oauth transient ${code} — retrying provision once provider=${provider} email=${normalizedEmail}`,
          'Auth',
        );
        const winner =
          (await this.users.findIdentity(provider, providerUserId)) ??
          (await this.users.findByEmail(normalizedEmail));
        if (winner) {
          const userId = 'userId' in winner ? winner.userId : winner.id;
          if (!('userId' in winner)) {
            await this.users.linkIdentity({
              userId: winner.id,
              provider,
              providerUserId,
              email: normalizedEmail,
            });
            await this.users.markEmailVerified(winner.id);
          }
          return this.requireAuthProfile(userId);
        }
        // Nothing persisted: the pooler dropped us before any write landed.
        // createUser's steps are individually idempotent, so a single retry
        // is safe and converges.
        const retryUsername = await this.generateUsername(
          normalizedEmail.split('@')[0] ?? 'user',
        );
        const retryUser = await this.users.createUser({
          email: normalizedEmail,
          username: retryUsername,
          displayName: input.displayName,
          passwordHash: null,
          emailVerified: new Date(),
        });
        await this.users.linkIdentity({
          userId: retryUser.id,
          provider,
          providerUserId,
          email: normalizedEmail,
        });
        this.logger.log(
          `auth.oauth.provisioned-on-retry provider=${provider} userId=${retryUser.id}`,
          'Auth',
        );
        return this.requireAuthProfile(retryUser.id);
      }
      throw error;
    }
  }

  private async requireAuthProfile(userId: string): Promise<UserAuthProfile> {
    const profile = await this.users.findAuthProfile(userId);
    if (!profile) {
      // Defensive: the row was just written, so this is a 500-class bug.
      throw new SessionExpiredError('Account setup did not complete. Please try again.');
    }
    return profile;
  }

  /** Deterministic handle from an email local part, suffixed on collision. */
  private async generateUsername(localPart: string): Promise<string> {
    const base =
      localPart
        .toLowerCase()
        .replace(/[^a-z0-9_.-]/g, '')
        .slice(0, 20) || 'user';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const username = attempt === 0 ? base : `${base}-${Math.floor(1000 + Math.random() * 9000)}`;
      const clash = await this.users.findByUsername(username);
      if (!clash) {
        return username;
      }
    }
    return `user-${Date.now().toString(36)}`;
  }
}
