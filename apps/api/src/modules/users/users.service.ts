import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@apteez/database';
import type { User } from '@apteez/database';
import type { AuthUser } from '@apteez/types';

export interface CreateUserInput {
  email: string;
  username: string;
  displayName: string;
  /** Null for OAuth-only accounts. */
  passwordHash: string | null;
  /** Set when the email was verified by the provider (Google OAuth). */
  emailVerified?: Date | null;
}

/** User with flattened authorization data, as resolved per request. */
export interface UserAuthProfile extends AuthUser {
  permissions: string[];
}

/**
 * User data management. Owns persistence concerns only — credential
 * verification, sessions and OAuth flows live in AuthService. Returned
 * profiles are always mapped to the safe shape; password hashes never
 * leave this service except into the hash verifier.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a user with the default `user` role and an empty default
   * Favorites collection. Deliberately NOT wrapped in an interactive
   * `$transaction`: DATABASE_URL is the Neon PgBouncer pooler
   * (`pgbouncer=true`), where multi-statement interactive transactions die
   * with P2028 ("Transaction not found") whenever the pooler routes two
   * statements to different backends — that failure mode broke OAuth
   * provisioning outright. Instead every step below is idempotent
   * (create-or-reuse / upsert), so a retry after any transient failure
   * converges instead of 500ing. Callers cannot inject roles here —
   * role assignment is an administrative operation by design.
   */
  async createUser(input: CreateUserInput): Promise<User> {
    // user.create and the role lookup are independent — fire together so a
    // far-away pooler pays one round trip instead of two. A P2002 here means
    // a concurrent signup won the CITEXT uniques: rethrown untouched so
    // AuthService maps it to the find-the-winner path / ACCOUNT_EXISTS.
    const [userCreated, roleRow] = await Promise.all([
      this.prisma.user.create({
        data: {
          email: input.email,
          username: input.username,
          displayName: input.displayName,
          passwordHash: input.passwordHash,
          ...(input.emailVerified ? { emailVerified: input.emailVerified } : {}),
        },
      }),
      this.prisma.role.findUnique({ where: { name: 'user' } }),
    ]);
    // Self-heal a missing `user` role (fresh DB without seed) and absorb a
    // concurrent role-create race the same way.
    let role = roleRow;
    if (!role) {
      try {
        role = await this.prisma.role.create({
          data: { name: 'user', description: 'Default member role' },
        });
      } catch {
        role = await this.prisma.role.findUniqueOrThrow({ where: { name: 'user' } });
      }
    }
    // The two link rows are independent — one round trip instead of two.
    await Promise.all([
      this.prisma.userRole.upsert({
        where: { userId_roleId: { userId: userCreated.id, roleId: role.id } },
        update: {},
        create: { userId: userCreated.id, roleId: role.id },
      }),
      // Idempotent on retry: @@unique([ownerId, name]) absorbs a re-run after
      // a partial failure, so no orphaned half-provisioned account can strand
      // a retrying OAuth callback.
      this.prisma.favoriteCollection.upsert({
        where: { ownerId_name: { ownerId: userCreated.id, name: 'Favorites' } },
        update: {},
        create: {
          ownerId: userCreated.id,
          name: 'Favorites',
          isDefault: true,
          defaultSlot: userCreated.id,
        },
      }),
    ]);
    return userCreated;
  }

  async findByEmail(email: string): Promise<User | null> {
    // CITEXT columns make this lookup case-insensitive in the database.
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * Single duplicate probe for registration (CITEXT keeps both arms
   * case-insensitive). Callers must map a hit to the generic
   * ACCOUNT_EXISTS error — never reveal which field collided.
   */
  async findByEmailOrUsername(email: string, username: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { OR: [{ email }, { username }] } });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { username } });
  }

  async findIdentity(provider: string, providerUserId: string) {
    return this.prisma.authIdentity.findUnique({
      where: { provider_providerUserId: { provider, providerUserId } },
    });
  }

  /**
   * Stamp a verified email. Google already proved ownership (its userinfo
   * reports email_verified), so provisioning and verified-email linking both
   * record it — but only when still null, never overwriting an earlier stamp.
   */
  async markEmailVerified(userId: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: userId, emailVerified: null },
      data: { emailVerified: new Date() },
    });
  }

  async linkIdentity(input: {
    userId: string;
    provider: string;
    providerUserId: string;
    email: string;
  }) {
    // Idempotent: a retried / concurrent Google callback must not 500 on the
    // @@unique([provider, providerUserId]) constraint — return the winner.
    try {
      return await this.prisma.authIdentity.create({ data: input });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'P2002'
      ) {
        const existing = await this.prisma.authIdentity.findUnique({
          where: {
            provider_providerUserId: {
              provider: input.provider,
              providerUserId: input.providerUserId,
            },
          },
        });
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  /** Enable/disable an account. Service-level only (admin flows come later). */
  async setActive(id: string, isActive: boolean): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { isActive } });
  }

  /**
   * Full auth profile: safe fields plus flattened role names and
   * `action:resource` permission strings from the database-backed grants.
   *
   * Latency design: the old 4-level Prisma include fanned out to ~5
   * sequential pooler round trips (~2s each from far regions, so /auth/me
   * took 13s and clients timed out into false logged-out states). This is
   * exactly 2 round trips — user row + one grants join — with identical
   * output shape.
   */
  async findAuthProfile(userId: string): Promise<UserAuthProfile | null> {
    const [user, grants] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.$queryRaw<{ role: string; action: string | null; resource: string | null }[]>(
        Prisma.sql`
          SELECT r."name" AS "role", p."action" AS "action", p."resource" AS "resource"
          FROM "user_roles" ur
          JOIN "roles" r ON r."id" = ur."roleId"
          LEFT JOIN "role_permissions" rp ON rp."roleId" = r."id"
          LEFT JOIN "permissions" p ON p."id" = rp."permissionId"
          WHERE ur."userId" = ${userId}::uuid
        `,
      ),
    ]);
    if (!user) {
      return null;
    }
    // Temporary suspensions lift themselves: once suspendedUntil passes, the
    // account reactivates on next auth resolution. Bans and deactivations
    // (no expiry) are unaffected.
    if (!user.isActive && user.suspendedUntil && user.suspendedUntil <= new Date()) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { isActive: true, suspendedUntil: null, statusReason: null },
      });
      user.isActive = true;
    }
    const roles = [...new Set(grants.map((grant) => grant.role))];
    const permissions = [
      ...new Set(
        grants.flatMap((grant) =>
          grant.action && grant.resource ? [`${grant.action}:${grant.resource}`] : [],
        ),
      ),
    ];
    return { ...toSafeUser(user), roles, permissions };
  }

  toSafeUser(user: User): AuthUser {
    return toSafeUser(user);
  }
}

/** Strip every internal/security field before a user crosses a boundary. */
export function toSafeUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarKey: user.avatarKey,
    country: user.country,
    institution: user.institution,
    bio: user.bio,
    timezone: user.timezone,
    isPrivate: user.isPrivate,
    isActive: user.isActive,
    emailVerified: user.emailVerified ? user.emailVerified.toISOString() : null,
    roles: [],
    permissions: [],
  };
}
