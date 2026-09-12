import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@apteez/database';
import type { CursorPage, FavoriteCollectionDto, FavoriteProblemDto } from '@apteez/types';
import type { FavoriteListQuery } from '@apteez/validation';
import { AppLogger } from '../../common/logger/app-logger';
import { FavoritesService } from './favorites.service';
import { ensureDefaultCollectionId } from './favorites.util';

/**
 * Custom collections. Every query and mutation is scoped to the authenticated
 * owner; a collection that exists but belongs to someone else is reported as
 * NOT FOUND so collection ids cannot be probed across accounts.
 *
 * Default ("Favorites") rules are enforced here, not in the UI: it can never
 * be renamed or deleted, and it can never be duplicated.
 */
@Injectable()
export class FavoriteCollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly favorites: FavoritesService,
    private readonly logger: AppLogger,
  ) {}

  async list(userId: string): Promise<FavoriteCollectionDto[]> {
    await ensureDefaultCollectionId(this.prisma, userId);
    const rows = await this.prisma.favoriteCollection.findMany({
      where: { ownerId: userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        name: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { items: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      isDefault: row.isDefault,
      problemCount: row._count.items,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async create(userId: string, name: string): Promise<FavoriteCollectionDto> {
    try {
      const created = await this.prisma.favoriteCollection.create({
        data: { ownerId: userId, name },
        select: { id: true, name: true, isDefault: true, createdAt: true, updatedAt: true },
      });
      this.logger.log(`favorites.collection.create userId=${userId} id=${created.id}`, 'Favorites');
      return { ...this.toDto(created), problemCount: 0 };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          statusCode: 409,
          code: 'COLLECTION_NAME_TAKEN',
          message: 'You already have a collection with this name.',
        });
      }
      throw error;
    }
  }

  async rename(userId: string, collectionId: string, name: string): Promise<FavoriteCollectionDto> {
    const collection = await this.requireOwned(userId, collectionId);
    if (collection.isDefault) {
      throw new ConflictException({
        statusCode: 409,
        code: 'DEFAULT_COLLECTION_IMMUTABLE',
        message: 'The default Favorites collection cannot be renamed.',
      });
    }
    try {
      const updated = await this.prisma.favoriteCollection.update({
        where: { id: collectionId },
        data: { name },
        select: {
          id: true,
          name: true,
          isDefault: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { items: true } },
        },
      });
      return {
        id: updated.id,
        name: updated.name,
        isDefault: updated.isDefault,
        problemCount: updated._count.items,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          statusCode: 409,
          code: 'COLLECTION_NAME_TAKEN',
          message: 'You already have a collection with this name.',
        });
      }
      throw error;
    }
  }

  /** Idempotent: deleting an already-removed collection still succeeds. */
  async remove(userId: string, collectionId: string): Promise<{ deleted: true }> {
    const collection = await this.prisma.favoriteCollection.findUnique({
      where: { id: collectionId },
      select: { ownerId: true, isDefault: true },
    });
    if (!collection) {
      return { deleted: true };
    }
    if (collection.ownerId !== userId) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Collection not found.',
      });
    }
    if (collection.isDefault) {
      throw new ConflictException({
        statusCode: 409,
        code: 'DEFAULT_COLLECTION_IMMUTABLE',
        message: 'The default Favorites collection cannot be deleted.',
      });
    }
    // Items cascade with the collection; the problems themselves are untouched.
    await this.prisma.favoriteCollection.deleteMany({
      where: { id: collectionId, ownerId: userId },
    });
    this.logger.log(`favorites.collection.delete userId=${userId} id=${collectionId}`, 'Favorites');
    return { deleted: true };
  }

  async listProblems(
    userId: string,
    collectionId: string,
    query: FavoriteListQuery,
  ): Promise<CursorPage<FavoriteProblemDto>> {
    await this.requireOwned(userId, collectionId);
    return this.favorites.listCollectionItems(userId, collectionId, query);
  }

  /** Idempotent add of a published problem to an owned collection. */
  async addProblem(
    userId: string,
    collectionId: string,
    problemId: string,
  ): Promise<{ added: true }> {
    await this.requireOwned(userId, collectionId);
    await this.favorites.requirePublishedProblem(problemId);
    await this.prisma.favoriteCollectionItem.upsert({
      where: { collectionId_problemId: { collectionId, problemId } },
      update: {},
      create: { collectionId, problemId },
    });
    return { added: true };
  }

  /** Idempotent remove — only this collection is affected. */
  async removeProblem(
    userId: string,
    collectionId: string,
    problemId: string,
  ): Promise<{ removed: true }> {
    await this.requireOwned(userId, collectionId);
    await this.prisma.favoriteCollectionItem.deleteMany({ where: { collectionId, problemId } });
    return { removed: true };
  }

  private async requireOwned(
    userId: string,
    collectionId: string,
  ): Promise<{ id: string; isDefault: boolean }> {
    const collection = await this.prisma.favoriteCollection.findFirst({
      where: { id: collectionId, ownerId: userId },
      select: { id: true, isDefault: true },
    });
    if (!collection) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Collection not found.',
      });
    }
    return collection;
  }

  private toDto(row: {
    id: string;
    name: string;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): Omit<FavoriteCollectionDto, 'problemCount'> {
    return {
      id: row.id,
      name: row.name,
      isDefault: row.isDefault,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
