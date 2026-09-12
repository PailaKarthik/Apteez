import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { RequestUser } from '../decorators/current-user.decorator';
import type { Env } from '../../config/env';
import { SessionService } from '../../modules/auth/session.service';
import { UsersService } from '../../modules/users/users.service';
import { extractSessionToken } from './session-auth.guard';

/**
 * Best-effort authentication for public-but-personalizable endpoints.
 * Attaches `request.user` when a valid session exists, never throws.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly users: UsersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    try {
      const token = extractSessionToken(
        request,
        this.config.get('SESSION_COOKIE_NAME', { infer: true }),
      );
      if (!token) {
        return true;
      }
      const session = await this.sessions.resolve(token);
      if (!session) {
        return true;
      }
      const profile = await this.users.findAuthProfile(session.userId);
      if (profile?.isActive) {
        request.user = { id: profile.id, roles: profile.roles, permissions: profile.permissions };
      }
    } catch {
      // Optional means optional: any failure degrades to anonymous.
    }
    return true;
  }
}
