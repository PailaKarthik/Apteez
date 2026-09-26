import { Global, Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

/**
 * Product analytics (global, like Redis): the recorder is called from a
 * dozen feature modules, and a global provider avoids import cycles and
 * repetitive wiring. Depends only on Prisma + logger — never on features.
 */
@Global()
@Module({
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
