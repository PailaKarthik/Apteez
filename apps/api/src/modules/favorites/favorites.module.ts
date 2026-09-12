import { Module } from '@nestjs/common';
import { ProblemsModule } from '../problems/problems.module';
import { FavoriteCollectionsController } from './favorite-collections.controller';
import { FavoriteCollectionsService } from './favorite-collections.service';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';

/**
 * Favorites and custom collections. Reuses ProblemsModule's batched summary
 * projection so saved-problem pages never issue per-row queries.
 */
@Module({
  imports: [ProblemsModule],
  controllers: [FavoritesController, FavoriteCollectionsController],
  providers: [FavoritesService, FavoriteCollectionsService],
  exports: [FavoritesService],
})
export class FavoritesModule {}
