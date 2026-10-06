import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import type { AdminUserDetailDto, AdminUserDto } from '@apteez/types';
import type { AdminUsersQuery, AdminUserStatusInput } from '@apteez/validation';
import { AppLogger } from '../../common/logger/app-logger';
import { EventQueueService } from '../../queue/event-queue.service';
import { SessionService } from '../auth/session.service';
import { UsersService } from '../users/users.service';
import { isAdmin, requireSuperAdminForTarget, type AdminCaller } from './admin-access';
import { AdminConflictError, AdminNotFoundError, AdminValidationError } from './admin.errors';

/**
 * Staff user management. Reads use explicit whitelisted selects (hashes,
 * secrets and tokens can never leak); writes are transactional, audited,
 * and notify the affected user. Display status derives deterministically:
 * active / suspended (future suspendedUntil) / banned (reason prefix) /
 * deactivated (everything else inactive).
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventQueueService,
    private readonly sessions: SessionService,
    private readonly users: UsersService,
    private readonly logger: AppLogger,
  ) {}

  async list(query: AdminUsersQuery): Promise<{
    items: AdminUserDto[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> {
    const now = new Date();
    const where = {
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q, mode: 'insensitive' as const } },
              { username: { contains: query.q, mode: 'insensitive' as const } },
              { displayName: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(query.institution
        ? { institution: { contains: query.institution, mode: 'insensitive' as const } }
        : {}),
      ...(query.role ? { roles: { some: { role: { name: query.role } } } } : {}),
      ...this.statusWhere(query.status, now),
    };
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          country: true,
          institution: true,
          isActive: true,
          suspendedUntil: true,
          statusReason: true,
          emailVerified: true,
          createdAt: true,
          roles: { select: { role: { select: { name: true } } } },
        },
      }),
    ]);
    return {
      items: rows.map((row) => this.toAdminUser(row)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async detail(id: string): Promise<AdminUserDetailDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        country: true,
        institution: true,
        avatarKey: true,
        timezone: true,
        isPrivate: true,
        isActive: true,
        suspendedUntil: true,
        statusReason: true,
        emailVerified: true,
        createdAt: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    if (!user) {
      throw new AdminNotFoundError('User not found.');
    }
    const [
      solvedCount,
      submissions,
      challenges,
      contests,
      events,
      contributionsTotal,
      contributionsApproved,
      points,
      reportsAgainst,
    ] = await Promise.all([
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT "problemId") AS count FROM "submissions"
        WHERE "userId" = ${id}::uuid AND "status" = 'SUBMITTED' AND "isCorrect" IS TRUE`,
      this.prisma.submission.count({ where: { userId: id, status: 'SUBMITTED' } }),
      this.prisma.challenge.count({ where: { OR: [{ player1Id: id }, { player2Id: id }] } }),
      this.prisma.contestParticipant.count({ where: { userId: id } }),
      this.prisma.eventParticipant.count({ where: { userId: id } }),
      this.prisma.contribution.count({ where: { contributorId: id } }),
      this.prisma.contribution.count({ where: { contributorId: id, status: 'APPROVED' } }),
      this.prisma.userPoints.findUnique({ where: { userId: id }, select: { balance: true } }),
      this.prisma.report.count({
        where: { targetType: 'USER', targetId: id, status: { in: ['OPEN', 'UNDER_REVIEW'] } },
      }),
    ]);
    return {
      ...this.toAdminUser(user),
      avatarKey: user.avatarKey,
      timezone: user.timezone,
      isPrivate: user.isPrivate,
      stats: {
        solvedCount: Number(solvedCount[0]?.count ?? 0),
        submissions,
        challengesPlayed: challenges,
        contestsEntered: contests,
        eventsJoined: events,
        contributions: { total: contributionsTotal, approved: contributionsApproved },
        points: points?.balance ?? 0,
        reportsFiledAgainst: reportsAgainst,
      },
    };
  }

  async setStatus(
    id: string,
    input: AdminUserStatusInput,
    caller: AdminCaller,
    ip?: string,
  ): Promise<AdminUserDto> {
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        isActive: true,
        suspendedUntil: true,
        statusReason: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    if (!target) {
      throw new AdminNotFoundError('User not found.');
    }
    requireSuperAdminForTarget(
      caller,
      target.roles.map((link) => link.role.name),
    );
    if (id === caller.id) {
      throw new AdminConflictError('You cannot change your own account status.');
    }
    if (input.status === 'SUSPENDED') {
      if (!input.suspendedUntil || input.suspendedUntil <= new Date()) {
        throw new AdminValidationError('Suspension requires a future expiration.');
      }
    }
    const previous = {
      isActive: target.isActive,
      suspendedUntil: target.suspendedUntil?.toISOString() ?? null,
      statusReason: target.statusReason,
    };
    const next =
      input.status === 'ACTIVE'
        ? { isActive: true, suspendedUntil: null, statusReason: null }
        : input.status === 'SUSPENDED'
          ? {
              isActive: false,
              suspendedUntil: input.suspendedUntil ?? null,
              statusReason: `suspended: ${input.reason}`,
            }
          : input.status === 'BANNED'
            ? { isActive: false, suspendedUntil: null, statusReason: `banned: ${input.reason}` }
            : {
                isActive: false,
                suspendedUntil: null,
                statusReason: `deactivated: ${input.reason}`,
              };
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.user.update({ where: { id }, data: next });
      await tx.adminAuditLog.create({
        data: {
          actorUserId: caller.id,
          action: 'user.status.change',
          targetType: 'USER',
          targetId: id,
          previousValue: previous as object,
          newValue: {
            ...next,
            suspendedUntil: next.suspendedUntil?.toISOString() ?? null,
          } as object,
          reason: input.reason,
          ip: ip ?? null,
        },
      });
      return row;
    });
    void this.events
      .notifyUser({
        userId: id,
        type: 'MODERATION_ACTION',
        title:
          input.status === 'ACTIVE'
            ? 'Your account was reactivated.'
            : `Your account was ${input.status.toLowerCase()}.`,
        body: input.reason.slice(0, 500),
      })
      .catch(() => undefined);
    if (!next.isActive) {
      // Incident response: suspension/ban must kill live sessions now, not on
      // next request. Best-effort — the guard's isActive check still enforces
      // deactivation even if Redis is unreachable here.
      try {
        const revoked = await this.sessions.revokeAllForUser(id);
        this.logger.log(`admin.sessions-revoked user=${id} sessions=${revoked}`, 'Admin');
      } catch (error) {
        this.logger.warn(
          `admin.sessions-revoke-failed user=${id} ${error instanceof Error ? error.message : String(error)}`,
          'Admin',
        );
      }
    }
    // Roles/permissions are cached per user (see UsersService) — drop the
    // entry so status changes apply within the next request, not the TTL.
    await this.users.clearAuthProfileCache(id);
    const roles = await this.prisma.userRole.findMany({
      where: { userId: id },
      select: { role: { select: { name: true } } },
    });
    return this.toAdminUser({
      ...updated,
      emailVerified: updated.emailVerified,
      roles,
    });
  }

  async setRoles(
    id: string,
    roles: string[],
    caller: AdminCaller,
    ip?: string,
  ): Promise<AdminUserDto> {
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, roles: { select: { role: { select: { name: true } } } } },
    });
    if (!target) {
      throw new AdminNotFoundError('User not found.');
    }
    if (id === caller.id) {
      throw new AdminConflictError('Role changes require a second administrator.');
    }
    const current = target.roles.map((link) => link.role.name);
    requireSuperAdminForTarget(caller, current);
    const known = await this.prisma.role.findMany({ select: { id: true, name: true } });
    const byName = new Map(known.map((role) => [role.name, role.id]));
    const normalized = [...new Set(roles.map((role) => role.trim()))];
    for (const name of normalized) {
      if (!byName.has(name)) {
        throw new AdminValidationError(`Unknown role: ${name}.`);
      }
    }
    if (normalized.includes('admin') && !isAdmin(caller)) {
      throw new AdminConflictError('Only an admin can grant the admin role.');
    }
    // Last-admin protection: the grant set must leave at least one admin on
    // the platform. Unknown names (e.g. retired roles) already failed above.
    const removesElevated = current.includes('admin') && !normalized.includes('admin');
    if (removesElevated) {
      const remaining = await this.prisma.userRole.count({
        where: {
          userId: { not: id },
          role: { name: 'admin' },
        },
      });
      if (remaining === 0) {
        throw new AdminConflictError('Cannot remove the last administrator account.');
      }
    }
    const toAdd = normalized.filter((name) => !current.includes(name));
    const toRemove = current.filter((name) => !normalized.includes(name));
    const updated = await this.prisma.$transaction(async (tx) => {
      if (toRemove.length > 0) {
        const ids = toRemove.map((name) => byName.get(name)!);
        await tx.userRole.deleteMany({ where: { userId: id, roleId: { in: ids } } });
      }
      for (const name of toAdd) {
        await tx.userRole.create({ data: { userId: id, roleId: byName.get(name)! } });
      }
      await tx.adminAuditLog.create({
        data: {
          actorUserId: caller.id,
          action: 'user.roles.change',
          targetType: 'USER',
          targetId: id,
          previousValue: { roles: current } as object,
          newValue: { roles: normalized } as object,
          ip: ip ?? null,
        },
      });
      return tx.user.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          country: true,
          institution: true,
          isActive: true,
          suspendedUntil: true,
          statusReason: true,
          emailVerified: true,
          createdAt: true,
          roles: { select: { role: { select: { name: true } } } },
        },
      });
    });
    // Role grants are cached per user — drop the entry so the new grants
    // apply within the next request, not the cache TTL.
    await this.users.clearAuthProfileCache(id);
    return this.toAdminUser(updated);
  }

  private statusWhere(status: AdminUsersQuery['status'], now: Date) {
    if (!status || status === 'ACTIVE') {
      return status === 'ACTIVE' ? { isActive: true } : {};
    }
    if (status === 'SUSPENDED') {
      return { isActive: false, suspendedUntil: { gt: now } };
    }
    if (status === 'BANNED') {
      return { isActive: false, statusReason: { startsWith: 'banned:' } };
    }
    return {
      isActive: false,
      NOT: [{ suspendedUntil: { gt: now } }, { statusReason: { startsWith: 'banned:' } }],
    };
  }

  private toAdminUser(row: {
    id: string;
    email: string;
    username: string | null;
    displayName: string;
    country: string | null;
    institution: string | null;
    isActive: boolean;
    suspendedUntil: Date | null;
    statusReason: string | null;
    emailVerified: Date | null;
    createdAt: Date;
    roles: Array<{ role: { name: string } }>;
  }): AdminUserDto {
    const now = new Date();
    const accountStatus =
      row.isActive === true
        ? 'ACTIVE'
        : row.suspendedUntil && row.suspendedUntil > now
          ? 'SUSPENDED'
          : row.statusReason?.startsWith('banned:')
            ? 'BANNED'
            : 'DEACTIVATED';
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      displayName: row.displayName,
      country: row.country,
      institution: row.institution,
      isActive: row.isActive,
      accountStatus,
      suspendedUntil: row.suspendedUntil?.toISOString() ?? null,
      statusReason: row.statusReason,
      emailVerified: row.emailVerified?.toISOString() ?? null,
      roles: row.roles.map((link) => link.role.name),
      createdAt: row.createdAt.toISOString(),
    };
  }
}
