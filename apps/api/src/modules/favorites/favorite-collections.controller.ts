import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  createCollectionSchema,
  favoriteListQuerySchema,
  renameCollectionSchema,
  type CreateCollectionInput,
  type FavoriteListQuery,
  type RenameCollectionInput,
} from '@apteez/validation';
import type { CursorPage, FavoriteCollectionDto, FavoriteProblemDto } from '@apteez/types';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { AuthRequiredError } from '../auth/auth.errors';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { FavoriteCollectionsService } from './favorite-collections.service';

/**
 * Custom collection management. Ownership is enforced in the service layer on
 * every read and write; the default Favorites collection is immutable and can
 * neither be renamed nor deleted.
 */
@Controller('favorite-collections')
export class FavoriteCollectionsController {
  constructor(private readonly collections: FavoriteCollectionsService) {}

  @Get()
  async list(@CurrentUser() user?: RequestUser): Promise<FavoriteCollectionDto[]> {
    if (!user) {
      throw new AuthRequiredError('Sign in to view your collections.');
    }
    return this.collections.list(user.id);
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(createCollectionSchema)) body: CreateCollectionInput,
    @CurrentUser() user?: RequestUser,
  ): Promise<FavoriteCollectionDto> {
    if (!user) {
      throw new AuthRequiredError('Sign in to create collections.');
    }
    return this.collections.create(user.id, body.name);
  }

  @Patch(':id')
  async rename(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(renameCollectionSchema)) body: RenameCollectionInput,
    @CurrentUser() user?: RequestUser,
  ): Promise<FavoriteCollectionDto> {
    if (!user) {
      throw new AuthRequiredError('Sign in to rename collections.');
    }
    return this.collections.rename(user.id, id, body.name);
  }

  @Delete(':id')
  async remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<{ deleted: true }> {
    if (!user) {
      throw new AuthRequiredError('Sign in to delete collections.');
    }
    return this.collections.remove(user.id, id);
  }

  @Get(':id/problems')
  async problems(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query(new ZodValidationPipe(favoriteListQuerySchema)) query: FavoriteListQuery,
    @CurrentUser() user?: RequestUser,
  ): Promise<CursorPage<FavoriteProblemDto>> {
    if (!user) {
      throw new AuthRequiredError('Sign in to view your collections.');
    }
    return this.collections.listProblems(user.id, id, query);
  }

  @Post(':id/problems/:problemId')
  async addProblem(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('problemId', new ParseUUIDPipe({ version: '4' })) problemId: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<{ added: true }> {
    if (!user) {
      throw new AuthRequiredError('Sign in to manage collections.');
    }
    return this.collections.addProblem(user.id, id, problemId);
  }

  @Delete(':id/problems/:problemId')
  async removeProblem(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('problemId', new ParseUUIDPipe({ version: '4' })) problemId: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<{ removed: true }> {
    if (!user) {
      throw new AuthRequiredError('Sign in to manage collections.');
    }
    return this.collections.removeProblem(user.id, id, problemId);
  }
}
