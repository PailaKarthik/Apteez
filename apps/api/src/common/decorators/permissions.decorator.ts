import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'apteez:permissions';

/** Restrict a route to granular `action:resource` permissions. */
export const RequirePermissions = (...permissions: string[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Alias matching the `@Permissions('review:contributions')` call style.
 * Enforced by the global PermissionsGuard.
 */
export const Permissions = RequirePermissions;
