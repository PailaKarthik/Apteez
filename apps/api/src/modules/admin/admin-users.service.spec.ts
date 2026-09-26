import type { PrismaService } from '@apteez/database';
import { AdminConflictError, AdminNotFoundError, AdminValidationError } from './admin.errors';
import { AdminUsersService } from './admin-users.service';
import type { AdminCaller } from './admin-access';

const ADMIN: AdminCaller = {
  id: 'admin1',
  roles: ['admin'],
  permissions: ['manage:users', 'manage:platform'],
};

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    email: 'user@example.com',
    username: 'user1',
    displayName: 'User One',
    country: null,
    institution: null,
    isActive: true,
    suspendedUntil: null,
    statusReason: null,
    emailVerified: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    roles: [],
    ...overrides,
  };
}

function createPrisma() {
  return {
    user: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
    userRole: { findMany: jest.fn(), deleteMany: jest.fn(), create: jest.fn(), count: jest.fn() },
    role: { findMany: jest.fn() },
    submission: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    challenge: { count: jest.fn().mockResolvedValue(0) },
    contestParticipant: { count: jest.fn().mockResolvedValue(0) },
    eventParticipant: { count: jest.fn().mockResolvedValue(0) },
    contribution: { count: jest.fn().mockResolvedValue(0) },
    userPoints: { findUnique: jest.fn().mockResolvedValue(null) },
    report: { count: jest.fn().mockResolvedValue(0) },
    adminAuditLog: { create: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([{ count: 3n }]),
    $transaction: jest.fn(),
  };
}

function passthrough(prisma: PrismaMock): void {
  (prisma.$transaction as jest.Mock).mockImplementation(async (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as Promise<unknown>[]),
  );
}

type PrismaMock = ReturnType<typeof createPrisma>;

function createService() {
  const prisma = createPrisma();
  const events = { notifyUser: jest.fn().mockResolvedValue(undefined) };
  const sessions = { revokeAllForUser: jest.fn().mockResolvedValue(2) };
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const service = new AdminUsersService(
    prisma as unknown as PrismaService,
    events as never,
    sessions as never,
    logger as never,
  );
  return { service, prisma, events, sessions };
}

describe('AdminUsersService', () => {
  describe('detail whitelisting', () => {
    it('never exposes hashes, secrets or tokens', async () => {
      const { service, prisma } = createService();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(userRow());
      const detail = await service.detail('u1');
      const serialized = JSON.stringify(detail);
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('token');
      expect(serialized).not.toContain('secret');
      expect(detail.email).toBe('user@example.com');
    });

    it('throws for unknown users', async () => {
      const { service, prisma } = createService();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.detail('missing')).rejects.toBeInstanceOf(AdminNotFoundError);
    });
  });

  describe('status changes', () => {
    it('rejects suspension without a future expiry', async () => {
      const { service, prisma } = createService();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(userRow({ roles: [] }));
      await expect(
        service.setStatus('u1', { status: 'SUSPENDED', reason: 'spammy behavior here' }, ADMIN),
      ).rejects.toBeInstanceOf(AdminValidationError);
    });

    it('rejects self status changes', async () => {
      const { service, prisma } = createService();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(userRow({ roles: [] }));
      await expect(
        service.setStatus('admin1', { status: 'BANNED', reason: 'self ban attempt' }, ADMIN),
      ).rejects.toBeInstanceOf(AdminConflictError);
    });

    it('suspends with expiry, audits and notifies inside the flow', async () => {
      const { service, prisma, events, sessions } = createService();
      passthrough(prisma);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(userRow({ roles: [] }));
      const future = new Date(Date.now() + 86_400_000);
      (prisma.user.update as jest.Mock).mockResolvedValue(
        userRow({ isActive: false, suspendedUntil: future }),
      );
      (prisma.userRole.findMany as jest.Mock).mockResolvedValue([]);
      const result = await service.setStatus(
        'u1',
        { status: 'SUSPENDED', reason: 'repeated spam links', suspendedUntil: future },
        ADMIN,
        '127.0.0.1',
      );
      expect(result.accountStatus).toBe('SUSPENDED');
      expect(events.notifyUser).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', type: 'MODERATION_ACTION' }),
      );
      expect(sessions.revokeAllForUser).toHaveBeenCalledWith('u1');
    });

    it('keeps sessions on reactivation but revokes on ban', async () => {
      const { service, prisma, sessions } = createService();
      passthrough(prisma);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(userRow({ roles: [] }));
      (prisma.user.update as jest.Mock).mockResolvedValue(userRow({ isActive: true }));
      (prisma.userRole.findMany as jest.Mock).mockResolvedValue([]);
      await service.setStatus('u1', { status: 'ACTIVE', reason: 'appeal upheld here' }, ADMIN);
      expect(sessions.revokeAllForUser).not.toHaveBeenCalled();
      (prisma.user.update as jest.Mock).mockResolvedValue(userRow({ isActive: false }));
      await service.setStatus('u1', { status: 'BANNED', reason: 'account takeover' }, ADMIN);
      expect(sessions.revokeAllForUser).toHaveBeenCalledWith('u1');
    });
  });

  describe('role changes', () => {
    function rolesSetup(current: string[], all = ['user', 'admin']) {
      const { service, prisma } = createService();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(
        userRow({ roles: current.map((name) => ({ role: { name } })) }),
      );
      (prisma.role.findMany as jest.Mock).mockResolvedValue(
        all.map((name) => ({ id: `r-${name}`, name })),
      );
      return { service, prisma };
    }

    it('rejects self role changes', async () => {
      const { service } = rolesSetup(['admin']);
      await expect(service.setRoles('admin1', ['admin'], ADMIN)).rejects.toBeInstanceOf(
        AdminConflictError,
      );
    });

    it('rejects unknown roles', async () => {
      const { service } = rolesSetup(['user']);
      await expect(service.setRoles('u1', ['wizard'], ADMIN)).rejects.toBeInstanceOf(
        AdminValidationError,
      );
    });

    it('rejects retired roles as unknown', async () => {
      const { service } = rolesSetup(['user']);
      await expect(service.setRoles('u1', ['user', 'moderator'], ADMIN)).rejects.toBeInstanceOf(
        AdminValidationError,
      );
      await expect(service.setRoles('u1', ['user', 'super_admin'], ADMIN)).rejects.toBeInstanceOf(
        AdminValidationError,
      );
    });

    it('lets admins grant the admin role', async () => {
      const { service, prisma } = rolesSetup(['user']);
      passthrough(prisma);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(
        userRow({ roles: [{ role: { name: 'user' } }] }),
      );
      (prisma.user as unknown as Record<string, jest.Mock>).findUniqueOrThrow = jest
        .fn()
        .mockResolvedValue(userRow({ id: 'u1' }));
      await service.setRoles('u1', ['user', 'admin'], ADMIN);
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'user.roles.change' }),
        }),
      );
    });

    it('protects the last administrator account', async () => {
      const { service, prisma } = rolesSetup(['admin']);
      (prisma.userRole.count as jest.Mock).mockResolvedValue(0);
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
      );
      await expect(service.setRoles('u1', ['user'], ADMIN)).rejects.toBeInstanceOf(
        AdminConflictError,
      );
    });
  });
});
