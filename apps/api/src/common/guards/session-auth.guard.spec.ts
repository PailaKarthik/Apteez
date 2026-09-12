import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { SessionService } from '../../modules/auth/session.service';
import { UsersService } from '../../modules/users/users.service';
import { SessionAuthGuard } from './session-auth.guard';

function makeGuard(session: { userId: string } | null, profile: object | null = null) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector;
  const sessions = {
    resolve: jest.fn(async () => session),
    revoke: jest.fn(async () => undefined),
  } as unknown as SessionService;
  const users = {
    findAuthProfile: jest.fn(async () => profile),
  } as unknown as UsersService;
  const config = {
    get: () => 'apteez_session',
  } as unknown as ConfigService<Env, true>;
  const guard = new SessionAuthGuard(reflector, sessions, users, config);
  return { guard, sessions, users };
}

function contextWith(
  headers: Record<string, string>,
  cookies: Record<string, string> = {},
): ExecutionContext {
  const request = { headers, cookies };
  return {
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
  } as unknown as ExecutionContext;
}

const PROFILE = { id: 'user-1', roles: ['user'], permissions: [], isActive: true };

describe('SessionAuthGuard', () => {
  it('skips routes marked public', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    } as unknown as Reflector;
    const guard = new SessionAuthGuard(
      reflector,
      {} as SessionService,
      {} as UsersService,
      {} as ConfigService<Env, true>,
    );
    await expect(guard.canActivate(contextWith({}))).resolves.toBe(true);
  });

  it('rejects requests without any credential', async () => {
    const { guard } = makeGuard(null);
    await expect(guard.canActivate(contextWith({}))).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      statusCode: 401,
    });
  });

  it('rejects unknown sessions as expired', async () => {
    const { guard } = makeGuard(null);
    await expect(
      guard.canActivate(contextWith({}, { apteez_session: 'stale' })),
    ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });

  it('burns the session when the account no longer exists', async () => {
    const { guard, sessions } = makeGuard({ userId: 'ghost' }, null);
    await expect(
      guard.canActivate(contextWith({}, { apteez_session: 'token' })),
    ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(sessions.revoke).toHaveBeenCalledWith('token');
  });

  it('rejects disabled accounts', async () => {
    const { guard } = makeGuard({ userId: 'user-1' }, { ...PROFILE, isActive: false });
    await expect(
      guard.canActivate(contextWith({}, { apteez_session: 'token' })),
    ).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED', statusCode: 403 });
  });

  it('attaches the user from a cookie session', async () => {
    const { guard } = makeGuard({ userId: 'user-1' }, PROFILE);
    const ctx = contextWith({}, { apteez_session: 'token' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    const request = ctx.switchToHttp().getRequest() as { user?: unknown };
    expect(request.user).toEqual({ id: 'user-1', roles: ['user'], permissions: [] });
  });

  it('accepts bearer tokens for non-browser clients', async () => {
    const { guard } = makeGuard({ userId: 'user-1' }, PROFILE);
    const ctx = contextWith({ authorization: 'Bearer mobile-token' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
