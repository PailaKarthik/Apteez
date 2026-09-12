import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import type { User } from '@apteez/database';
import type { AuthUser } from '@apteez/types';

export interface CreateUserInput {
  email: string;
  username: string;
  displayName: string;
  /** Null for OAuth-only accounts. */
  passwordHash: string | null;
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
   * Favorites collection, atomically. Callers cannot inject roles here —
   * role assignment is an administrative operation by design.
   */
  async createUser(input: CreateUserInput): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          username: input.username,
          displayName: input.displayName,
          passwordHash: input.passwordHash,
        },
      });
      const role = await tx.role.findUniqueOrThrow({ where: { name: 'user' } });
      await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
      await tx.favoriteCollection.create({
        data: { ownerId: user.id, name: 'Favorites', isDefault: true, defaultSlot: user.id },
      });
      return user;
    });
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

  async linkIdentity(input: {
    userId: string;
    provider: string;
    providerUserId: string;
    email: string;
  }) {
    return this.prisma.authIdentity.create({ data: input });
  }

  /** Enable/disable an account. Service-level only (admin flows come later). */
  async setActive(id: string, isActive: boolean): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { isActive } });
  }

  /**
   * Full auth profile: safe fields plus flattened role names and
   * `action:resource` permission strings from the database-backed grants.
   */
  async findAuthProfile(userId: string): Promise<UserAuthProfile | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });
    if (!user) {
      return null;
    }
    const roles = user.roles.map((link) => link.role.name);
    const permissions = [
      ...new Set(
        user.roles.flatMap((link) =>
          link.role.permissions.map(
            (grant) => `${grant.permission.action}:${grant.permission.resource}`,
          ),
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
    isActive: user.isActive,
    roles: [],
    permissions: [],
  };
}
