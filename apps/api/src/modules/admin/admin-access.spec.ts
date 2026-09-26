import { AuthRequiredError } from '../auth/auth.errors';
import {
  callerOf,
  isAdmin,
  isSuperAdmin,
  requireAdmin,
  requireAnyArea,
  requireArea,
  requireSuperAdminForTarget,
} from './admin-access';
import { AdminForbiddenError } from './admin.errors';

const MEMBER = { id: 'u1', roles: ['user'], permissions: ['read:questions'] };
// Admins hold manage:platform, so every area bypasses for them.
const ADMIN = {
  id: 'a1',
  roles: ['admin'],
  permissions: ['manage:users', 'manage:questions', 'manage:platform'],
};

describe('admin access control', () => {
  it('requires authentication', () => {
    expect(() => callerOf(undefined)).toThrow(AuthRequiredError);
  });

  it('grants areas by permission and bypasses admins', () => {
    expect(requireArea(ADMIN, 'users')).toBe(ADMIN);
    expect(requireArea(ADMIN, 'discussions')).toBe(ADMIN);
    expect(() => requireArea(MEMBER, 'users')).toThrow(AdminForbiddenError);
    expect(requireAnyArea(ADMIN, ['users', 'discussions'])).toBe(ADMIN);
    expect(() => requireAnyArea(MEMBER, ['users', 'discussions'])).toThrow(AdminForbiddenError);
  });

  it('treats admin as admin and platform bypass holder', () => {
    expect(isAdmin(ADMIN)).toBe(true);
    expect(isAdmin(MEMBER)).toBe(false);
    expect(isSuperAdmin(ADMIN)).toBe(true);
    expect(isSuperAdmin(MEMBER)).toBe(false);
    expect(() => requireAdmin(MEMBER)).toThrow(AdminForbiddenError);
  });

  it('never blocks on retired super_admin targets for admins', () => {
    expect(() => requireSuperAdminForTarget(ADMIN, ['super_admin'])).not.toThrow();
    expect(() => requireSuperAdminForTarget(ADMIN, ['user'])).not.toThrow();
  });
});
