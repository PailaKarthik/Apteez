import { PrismaClient } from '../generated/client';
import {
  ACHIEVEMENTS,
  CATEGORIES,
  EXAM_TAGS,
  PERMISSIONS,
  REWARD_RULES,
  ROLES,
  SUBTOPICS,
  TOPICS,
  seedRbac,
  seedOrganizations,
  seedRewards,
  seedTaxonomy,
} from './seed-data';

/**
 * Production bootstrap: structural data ONLY (roles, permissions, grants,
 * categories, topics, subtopics, exam tags, reward rules, achievements).
 * Never creates users, problems, submissions, contest participants, or
 * analytics — see DEPLOYMENT.md.
 *
 * Idempotent: safe to re-run after every deploy (all writes are upserts).
 *
 * Optional first-admin wiring: when BOOTSTRAP_ADMIN_EMAIL names an already
 * registered user, that account is granted the `admin` role. The account
 * itself must be created through the normal signup flow first — bootstrap
 * never invents credentials.
 *
 *   DATABASE_URL=... pnpm --filter @apteez/database db:bootstrap
 *   BOOTSTRAP_ADMIN_EMAIL=you@example.com pnpm --filter @apteez/database db:bootstrap
 */
const prisma = new PrismaClient();

async function grantInitialAdmin(email: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, isActive: true },
  });
  if (!user) {
    process.stdout.write(
      `BOOTSTRAP_ADMIN_EMAIL=${email} does not match a registered user yet — ` +
        `register that account first, then re-run bootstrap.\n`,
    );
    return;
  }
  for (const roleName of ['admin']) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }
  process.stdout.write(`Granted admin to ${user.email}.\n`);
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for bootstrap.');
  }
  await seedRbac(prisma);
  await seedTaxonomy(prisma);
  await seedRewards(prisma);
  await seedOrganizations(prisma);
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim();
  if (adminEmail) {
    await grantInitialAdmin(adminEmail);
  }
  process.stdout.write(
    `Bootstrap complete: ${ROLES.length} roles, ${PERMISSIONS.length} permissions, ` +
      `${CATEGORIES.length} categories, ${TOPICS.length} topics, ` +
      `${SUBTOPICS.length} subtopics, ${EXAM_TAGS.length} exam tags, ` +
      `${REWARD_RULES.length} reward rules, ${ACHIEVEMENTS.length} achievements.\n`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
