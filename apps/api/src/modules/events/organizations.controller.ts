import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import { organizationCreateSchema, type OrganizationCreateInput } from '@apteez/validation';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { OptionalAuth } from '../../common/decorators/auth.decorator';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { AuthRequiredError } from '../auth/auth.errors';
import { EventValidationError } from './events.errors';

function caller(user?: RequestUser) {
  if (!user) {
    throw new AuthRequiredError('Sign in to continue.');
  }
  return { id: user.id, roles: user.roles, permissions: user.permissions };
}

/** Minimal university/organization directory backing UNIVERSITY events. */
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly prisma: PrismaService) {}

  @OptionalAuth()
  @Get()
  async list(@CurrentUser() user?: RequestUser, @Query('q') q?: string) {
    // No `take` cap: the directory is small (hundreds) and the create-event
    // dropdown must contain freshly added colleges. `q` narrows server-side.
    const query = (q ?? '').trim().slice(0, 80);
    const rows = await this.prisma.organization.findMany({
      where: query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { slug: { contains: query, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: true } } },
    });
    const memberOf = new Set<string>();
    if (user) {
      const memberships = await this.prisma.organizationMember.findMany({
        where: { userId: user.id },
        select: { organizationId: true },
      });
      for (const m of memberships) {
        memberOf.add(m.organizationId);
      }
    }
    return {
      items: rows.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        description: o.description,
        memberCount: o._count.members,
        isMember: memberOf.has(o.id),
      })),
    };
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(organizationCreateSchema)) body: OrganizationCreateInput,
    @CurrentUser() user?: RequestUser,
  ) {
    // Self-serve directory: any signed-in user may add their college (they
    // become owner + first member). The slug unique keeps it deduplicated.
    const c = caller(user);
    const slug = body.slug.trim().toLowerCase();
    const existing = await this.prisma.organization.findUnique({ where: { slug } });
    if (existing) {
      throw new EventValidationError(`"${existing.name}" is already listed — select it instead.`);
    }
    try {
      const org = await this.prisma.organization.create({
        data: {
          name: body.name.trim(),
          slug,
          description: body.description?.trim() ?? null,
          ownerId: c.id,
        },
      });
      await this.prisma.organizationMember.create({
        data: { organizationId: org.id, userId: c.id },
      });
      return { id: org.id, slug: org.slug };
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: unknown }).code === 'P2002'
      ) {
        throw new EventValidationError('That university was just added — select it instead.');
      }
      throw error;
    }
  }

  @Post(':id/join')
  async join(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ) {
    const c = caller(user);
    const org = await this.prisma.organization.findUnique({ where: { id }, select: { id: true } });
    if (!org) {
      throw new EventValidationError('That university no longer exists.');
    }
    await this.prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: id, userId: c.id } },
      update: {},
      create: { organizationId: id, userId: c.id },
    });
    return { joined: true };
  }
}
