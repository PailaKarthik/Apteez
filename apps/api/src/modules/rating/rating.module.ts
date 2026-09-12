import { Module } from '@nestjs/common';
import { RatingCalculator } from './rating.calculator';
import { RatingController } from './rating.controller';
import { RatingHistoryService } from './rating-history.service';
import { RatingRepository } from './rating.repository';
import { RatingService } from './rating.service';

/**
 * Isolated challenge rating domain. The calculator is pure and framework-free;
 * the service orchestrates atomic, idempotent updates; the repository owns
 * persistence. Nothing here is imported by Challenge except the service it
 * calls on finalize, keeping the algorithm swappable without touching the
 * challenge engine.
 */
@Module({
  controllers: [RatingController],
  providers: [RatingCalculator, RatingRepository, RatingHistoryService, RatingService],
  exports: [RatingService, RatingCalculator],
})
export class RatingModule {}
