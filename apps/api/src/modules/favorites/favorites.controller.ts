import { Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { favoriteListQuerySchema, type FavoriteListQuery } from '@apteez/validation';
import type { CursorPage, FavoriteMembershipDto, FavoriteProblemDto } from '@apteez/types';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { AuthRequiredError } from '../auth/auth.errors';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { FavoritesService } from './favorites.service';

/**
 * Favorites endpoints. All routes are authenticated; the caller is always
 * resolved from the session, never from the payload. Toggling is idempotent
 * so repeated/racing heart clicks converge on a single state.
 */
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(favoriteListQuerySchema)) query: FavoriteListQuery,
    @CurrentUser() user?: RequestUser,
  ): Promise<CursorPage<FavoriteProblemDto>> {
    if (!user) {
      throw new AuthRequiredError('Sign in to view your favorites.');
    }
    return this.favorites.list(user.id, query);
  }

  /** Membership of the given problems in the caller's collections. */
  @Get('membership')
  async membership(
    @Query('problemIds') problemIds: string | undefined,
    @CurrentUser() user?: RequestUser,
  ): Promise<FavoriteMembershipDto[]> {
    if (!user) {
      throw new AuthRequiredError('Sign in to view your favorites.');
    }
    // Non-UUID entries are dropped: Prisma rejects malformed UUIDs with a
    // driver error, and membership is a best-effort lookup, not validation.
    const ids = (problemIds ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => UUID_V4_PATTERN.test(value))
      .slice(0, 100);
    return this.favorites.membership(user.id, ids);
  }

  /** Idempotent toggle of the default Favorites collection. */
  @Post(':problemId')
  async toggle(
    @Param('problemId', new ParseUUIDPipe({ version: '4' })) problemId: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<{ favorited: boolean }> {
    if (!user) {
      throw new AuthRequiredError('Sign in to save problems.');
    }
    return this.favorites.toggle(user.id, problemId);
  }

  @Delete(':problemId')
  async remove(
    @Param('problemId', new ParseUUIDPipe({ version: '4' })) problemId: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<{ favorited: false }> {
    if (!user) {
      throw new AuthRequiredError('Sign in to save problems.');
    }
    return this.favorites.remove(user.id, problemId);
  }
}
