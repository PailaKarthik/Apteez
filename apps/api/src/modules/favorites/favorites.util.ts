import { PrismaService } from '@apteez/database';

/**
 * Resolves the caller's default "Favorites" collection, creating it if an
 * older account somehow lacks one. Safe under concurrency: the unique
 * `defaultSlot` index guarantees at most one default row per user, so a
 * racing insert that loses the unique race simply re-reads the winner.
 */
export async function ensureDefaultCollectionId(
  prisma: PrismaService,
  userId: string,
): Promise<string> {
  const existing = await prisma.favoriteCollection.findFirst({
    where: { ownerId: userId, isDefault: true },
    select: { id: true },
  });
  if (existing) {
    return existing.id;
  }
  try {
    const created = await prisma.favoriteCollection.create({
      data: { ownerId: userId, name: 'Favorites', isDefault: true, defaultSlot: userId },
      select: { id: true },
    });
    return created.id;
  } catch {
    const winner = await prisma.favoriteCollection.findFirstOrThrow({
      where: { ownerId: userId, isDefault: true },
      select: { id: true },
    });
    return winner.id;
  }
}
