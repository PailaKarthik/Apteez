import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@apteez/database';
import type { LoginInput, RegisterInput } from '@apteez/validation';
import { AppError } from '../../common/errors/app-error';
import { AppLogger } from '../../common/logger/app-logger';
import type { Env } from '../../config/env';
import { PasswordService } from './password.service';
import { SessionService, type SessionMeta } from './session.service';
import { UsersService, type UserAuthProfile } from '../users/users.service';
import {
  AccountDisabledError,
  AccountExistsError,
  InvalidCredentialsError,
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
    const existing = await this.users.findIdentity(provider, providerUserId);
    if (existing) {
      const profile = await this.requireAuthProfile(existing.userId);
      this.logger.log(`auth.oauth.linked provider=${provider} userId=${existing.userId}`, 'Auth');
      return profile;
    }
    const byEmail = await this.users.findByEmail(email);
    if (byEmail) {
      await this.users.linkIdentity({ userId: byEmail.id, provider, providerUserId, email });
      this.logger.log(`auth.oauth.linked provider=${provider} userId=${byEmail.id}`, 'Auth');
      return this.requireAuthProfile(byEmail.id);
    }
    const username = await this.generateUsername(email.split('@')[0] ?? 'user');
    const user = await this.users.createUser({
      email,
      username,
      displayName: input.displayName,
      passwordHash: null,
    });
    await this.users.linkIdentity({ userId: user.id, provider, providerUserId, email });
    this.logger.log(`auth.oauth.provisioned provider=${provider} userId=${user.id}`, 'Auth');
    return this.requireAuthProfile(user.id);
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
