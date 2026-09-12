import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { RequestUser } from '../decorators/current-user.decorator';
import type { Env } from '../../config/env';
import { SessionService } from '../../modules/auth/session.service';
import { UsersService } from '../../modules/users/users.service';
import {
  AccountDisabledError,
  AuthRequiredError,
  SessionExpiredError,
} from '../../modules/auth/auth.errors';

/**
 * Global authentication guard. Resolves the opaque session token from the
 * session cookie (web) or `Authorization: Bearer` (future mobile), loads the
 * database-backed profile, and attaches it as `request.user` for the
 * roles/permissions guards downstream. Routes marked `@Public()` skip it.
 *
 * Execution order (request pipeline):
 *   authentication validation → user resolution → role/permission check
 *   → controller → service → database.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly users: UsersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const token = extractSessionToken(
      request,
      this.config.get('SESSION_COOKIE_NAME', { infer: true }),
    );
    if (!token) {
      throw new AuthRequiredError();
    }
    const session = await this.sessions.resolve(token);
    if (!session) {
      throw new SessionExpiredError();
    }
    const profile = await this.users.findAuthProfile(session.userId);
    if (!profile) {
      // Account removed after the session was issued: burn the session.
      await this.sessions.revoke(token);
      throw new SessionExpiredError();
    }
    if (!profile.isActive) {
      throw new AccountDisabledError();
    }
    request.user = { id: profile.id, roles: profile.roles, permissions: profile.permissions };
    return true;
  }
}

/** Cookie first (web), Bearer fallback (mobile + tooling). */
export function extractSessionToken(request: Request, cookieName: string): string | undefined {
  const fromCookie = (request.cookies as Record<string, unknown> | undefined)?.[cookieName];
  if (typeof fromCookie === 'string' && fromCookie.length > 0) {
    return fromCookie;
  }
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim();
    return token.length > 0 ? token : undefined;
  }
  return undefined;
}
