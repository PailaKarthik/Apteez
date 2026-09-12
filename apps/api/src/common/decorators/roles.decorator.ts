import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'apteez:roles';

/** Restrict a route to one or more roles (enforced by RolesGuard). */
export const Roles = (...roles: string[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(ROLES_KEY, roles);
