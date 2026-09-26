import type { RequestUser } from '../../common/decorators/current-user.decorator';
import { AuthRequiredError } from '../auth/auth.errors';
import { AdminForbiddenError } from './admin.errors';

/** Areas map onto the existing `action:resource` permission model. */
export type AdminArea =
  | 'users'
  | 'content'
  | 'contributions'
  | 'discussions'
  | 'contests'
  | 'events'
  | 'rewards'
  | 'analytics';

const AREA_PERMISSIONS: Record<AdminArea, string[]> = {
  users: ['manage:users'],
  content: ['manage:questions'],
  contributions: ['review:contributions'],
  discussions: ['moderate:discussions'],
  contests: ['manage:contests'],
  events: ['manage:events'],
  rewards: ['manage:rewards'],
  analytics: ['view:analytics'],
};

export interface AdminCaller {
  id: string;
  roles: string[];
  permissions: string[];
}

export function callerOf(user?: RequestUser): AdminCaller {
  if (!user) {
    throw new AuthRequiredError('Sign in as an admin.');
  }
  return { id: user.id, roles: user.roles ?? [], permissions: user.permissions ?? [] };
}

/**
 * Platform-wide bypass. The platform has exactly two roles (user, admin) and
 * every admin holds `manage:platform`, so this is true for all admins.
 */
export function isSuperAdmin(caller: Pick<AdminCaller, 'roles' | 'permissions'>): boolean {
  return caller.permissions.includes('manage:platform');
}

export function isAdmin(caller: Pick<AdminCaller, 'roles' | 'permissions'>): boolean {
  return isSuperAdmin(caller) || caller.roles.includes('admin');
}

/**
 * Area gate. Admins (manage:platform) bypass every area; otherwise the
 * caller needs one of the area's permissions. Frontend hiding is UX only —
 * every admin handler calls this (or requireAdmin) server-side.
 */
export function requireArea(caller: AdminCaller, area: AdminArea): AdminCaller {
  if (isSuperAdmin(caller)) {
    return caller;
  }
  const allowed = AREA_PERMISSIONS[area].some((permission) =>
    caller.permissions.includes(permission),
  );
  if (!allowed) {
    throw new AdminForbiddenError(`Permission required: ${AREA_PERMISSIONS[area].join(' or ')}.`);
  }
  return caller;
}

export function requireAdmin(caller: AdminCaller): AdminCaller {
  if (!isAdmin(caller)) {
    throw new AdminForbiddenError('Admin access is required.');
  }
  return caller;
}

/** Passes when the caller holds any one of the given areas. */
export function requireAnyArea(caller: AdminCaller, areas: AdminArea[]): AdminCaller {
  if (isSuperAdmin(caller)) {
    return caller;
  }
  const needed = areas.flatMap((area) => AREA_PERMISSIONS[area]);
  const allowed = needed.some((permission) => caller.permissions.includes(permission));
  if (!allowed) {
    throw new AdminForbiddenError(`Permission required: one of ${needed.join(', ')}.`);
  }
  return caller;
}

/**
 * Legacy shield for super_admin accounts (the role no longer exists — only
 * two roles remain — but the check is harmless if one ever reappears).
 */
export function requireSuperAdminForTarget(caller: AdminCaller, targetRoles: string[]): void {
  if (targetRoles.includes('super_admin') && !isSuperAdmin(caller)) {
    throw new AdminForbiddenError('Only an admin can modify a super admin account.');
  }
}
