import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RequestUser } from '../decorators/current-user.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

/** Granular `action:resource` authorization; see RolesGuard for the model. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Authentication is required.',
      });
    }
    const permissions = user.permissions ?? [];
    const allowed = required.every((permission) => permissions.includes(permission));
    if (!allowed) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'You do not have access to this resource.',
      });
    }
    return true;
  }
}
