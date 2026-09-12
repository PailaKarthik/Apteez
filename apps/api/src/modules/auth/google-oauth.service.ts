import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../../common/logger/app-logger';
import type { Env } from '../../config/env';
import { redisKeys } from '../../redis/redis-keys';
import { RedisService } from '../../redis/redis.service';
import { AuthService, type RequestMeta } from './auth.service';
import type { UserAuthProfile } from '../users/users.service';
import { InvalidOAuthError, OAuthNotConfiguredError } from './auth.errors';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const STATE_TTL_SECONDS = 600;
const PROVIDER_TIMEOUT_MS = 10_000;

export interface OAuthResult {
  user: UserAuthProfile;
  token: string;
  expiresAt: Date;
  next: string;
}

interface GoogleTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

interface GoogleUserInfo {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

/**
 * Only relative in-app paths may follow an OAuth login (`/profile`,
 * `/contribute`). Anything else — absolute URLs, protocol-relative URLs,
 * backslashes — falls back to `/`. Shared with the web client, which
 * enforces the same rule before sending `next`.
 */
export function isSafeNextPath(next: string | undefined): next is string {
  return (
    typeof next === 'string' &&
    next.startsWith('/') &&
    !next.startsWith('//') &&
    !next.includes('\\') &&
    !next.includes(':')
  );
}

/**
 * Google OAuth 2.0 (authorization code flow). Provider specifics stay in
 * this file; user provisioning and sessions are delegated to AuthService
 * so every login path converges on the same code.
 */
@Injectable()
export class GoogleOAuthService {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly redis: RedisService,
    private readonly auth: AuthService,
    private readonly logger: AppLogger,
  ) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get('GOOGLE_CLIENT_ID', { infer: true }) &&
      this.config.get('GOOGLE_CLIENT_SECRET', { infer: true }) &&
      this.config.get('GOOGLE_CALLBACK_URL', { infer: true }),
    );
  }

  /** Start URL + single-use state token. Throws when OAuth is unconfigured. */
  async begin(next: string | undefined): Promise<{ url: string }> {
    const clientId = this.config.get('GOOGLE_CLIENT_ID', { infer: true });
    const callbackUrl = this.config.get('GOOGLE_CALLBACK_URL', { infer: true });
    if (!clientId || !this.config.get('GOOGLE_CLIENT_SECRET', { infer: true }) || !callbackUrl) {
      throw new OAuthNotConfiguredError();
    }
    const state = randomBytes(32).toString('hex');
    const safeNext = isSafeNextPath(next) ? next : '/';
    await this.redis.set(
      redisKeys.oauthState(state),
      JSON.stringify({ next: safeNext }),
      STATE_TTL_SECONDS,
    );
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
      prompt: 'select_account',
    });
    return { url: `${AUTHORIZE_URL}?${params.toString()}` };
  }

  async callback(
    code: string | undefined,
    state: string | undefined,
    meta: RequestMeta,
  ): Promise<OAuthResult> {
    if (!this.isConfigured()) {
      throw new OAuthNotConfiguredError();
    }
    if (!code || !state) {
      throw new InvalidOAuthError('Google sign-in was interrupted. Please try again.');
    }
    const stored = await this.redis.get(redisKeys.oauthState(state));
    // Single-use: consume before any network calls (replay-safe).
    await this.redis.del(redisKeys.oauthState(state));
    if (!stored) {
      throw new InvalidOAuthError('Google sign-in expired. Please try again.');
    }
    let next = '/';
    try {
      const parsed = JSON.parse(stored) as { next?: unknown };
      if (isSafeNextPath(typeof parsed.next === 'string' ? parsed.next : undefined)) {
        next = parsed.next as string;
      }
    } catch {
      // Fall through to '/'.
    }
    const tokens = await this.exchangeCode(code);
    const info = await this.fetchUserInfo(tokens.accessToken);
    if (!info.sub || !info.email || info.emailVerified !== true) {
      this.logger.warn('auth.oauth.unverified Google identity rejected', 'Auth');
      throw new InvalidOAuthError('Google could not verify this account.');
    }
    const email = info.email.trim().toLowerCase();
    const user = await this.auth.findOrCreateOAuthUser({
      provider: 'google',
      providerUserId: info.sub,
      email,
      displayName: (info.name ?? email.split('@')[0] ?? 'ApteeZ member').trim().slice(0, 60),
    });
    this.logger.log(
      `auth.oauth.login provider=google userId=${user.id} ip=${meta.ip ?? '?'}`,
      'Auth',
    );
    const session = await this.auth.issueSession(user, { ...meta, via: 'oauth' });
    return { user: session.user, token: session.token, expiresAt: session.expiresAt, next };
  }

  private async exchangeCode(code: string): Promise<{ accessToken: string }> {
    let response: Response;
    try {
      response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: this.config.get('GOOGLE_CLIENT_ID', { infer: true }) ?? '',
          client_secret: this.config.get('GOOGLE_CLIENT_SECRET', { infer: true }) ?? '',
          redirect_uri: this.config.get('GOOGLE_CALLBACK_URL', { infer: true }) ?? '',
          grant_type: 'authorization_code',
        }).toString(),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.warn(
        `auth.oauth.token unreachable: ${error instanceof Error ? error.message : String(error)}`,
        'Auth',
      );
      throw new InvalidOAuthError();
    }
    if (!response.ok) {
      // Provider error bodies may contain tokens — logged never, shown never.
      this.logger.warn(`auth.oauth.token rejected status=${response.status}`, 'Auth');
      throw new InvalidOAuthError();
    }
    const body = (await response.json().catch(() => null)) as GoogleTokenResponse | null;
    if (!body?.access_token) {
      throw new InvalidOAuthError();
    }
    return { accessToken: body.access_token };
  }

  private async fetchUserInfo(accessToken: string): Promise<{
    sub?: string;
    email?: string;
    emailVerified?: boolean;
    name?: string;
  }> {
    let response: Response;
    try {
      response = await fetch(USERINFO_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
    } catch {
      throw new InvalidOAuthError();
    }
    if (!response.ok) {
      this.logger.warn(`auth.oauth.userinfo rejected status=${response.status}`, 'Auth');
      throw new InvalidOAuthError();
    }
    const body = (await response.json().catch(() => null)) as GoogleUserInfo | null;
    return {
      sub: typeof body?.sub === 'string' ? body.sub : undefined,
      email: typeof body?.email === 'string' ? body.email : undefined,
      emailVerified: body?.email_verified,
      name: typeof body?.name === 'string' ? body.name : undefined,
    };
  }
}
