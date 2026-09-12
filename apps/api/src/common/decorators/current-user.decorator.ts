import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/**
 * Authenticated caller attached by SessionAuthGuard. Roles and permissions
 * are always populated (possibly empty) — guards can rely on them.
 */
export interface RequestUser {
  id: string;
  roles: string[];
  permissions: string[];
}

/**
 * Extracts the authenticated user attached to the request by the auth
 * layer (lands with the authentication flows in a later prompt).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: RequestUser }>();
    return request.user;
  },
);
