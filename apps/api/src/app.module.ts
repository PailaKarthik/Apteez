import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '@apteez/database';
import { CommonModule } from './common/common.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { SessionAuthGuard } from './common/guards/session-auth.guard';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { OriginCheckMiddleware } from './common/middleware/origin-check.middleware';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { RedisThrottlerStorage } from './common/throttle/redis-throttler.storage';
import { AppLogger } from './common/logger/app-logger';
import { RedisService } from './redis/redis.service';
import { type Env, validateEnv } from './config/env';
import { FeatureFlagsModule } from './config/feature-flags.module';
import { AiModule } from './modules/ai/ai.module';
import { EmailModule } from './modules/email/email.module';
import { HealthModule } from './health/health.module';import { RedisModule } from './redis/redis.module';
import { StorageModule } from './storage/storage.module';
import { AdminModule } from './modules/admin/admin.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { ChallengeModule } from './modules/challenge/challenge.module';
import { ContestModule } from './modules/contest/contest.module';
import { ContributionModule } from './modules/contribution/contribution.module';
import { DiscussionModule } from './modules/discussion/discussion.module';
import { EventsModule } from './modules/events/events.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { LeaderboardModule } from './modules/leaderboard/leaderboard.module';
import { LearningModule } from './modules/learning/learning.module';
import { NotificationModule } from './modules/notification/notification.module';
import { ProblemsModule } from './modules/problems/problems.module';
import { ProfileModule } from './modules/profile/profile.module';
import { QueueModule } from './queue/queue.module';
import { RatingModule } from './modules/rating/rating.module';
import { RewardsModule } from './modules/rewards/rewards.module';
import { SearchModule } from './modules/search/search.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { SubmissionsModule } from './modules/submissions/submissions.module';
import { UsersModule } from './modules/users/users.module';

/**
 * Root module. Shared infrastructure (config, logging, database, redis,
 * storage, health, rate limiting) is global; the sixteen product modules
 * are registered as boundaries so later prompts implement them
 * independently without touching this file's structure.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      // Local package env first, then the repository-root .env.
      envFilePath: ['.env', '../../.env'],
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, RedisService, AppLogger],
      useFactory: (config: ConfigService<Env, true>, redis: RedisService, logger: AppLogger) => ({
        // Single `default` throttler on purpose: @nestjs/throttler evaluates
        // EVERY configured throttler sequentially per request (one Upstash
        // Lua eval each, ~45ms+ apiece), so N named throttlers add N× latency
        // and N× billed commands to every call. Tight per-route budgets live
        // on the route itself via @Throttle({ default: { limit, ttl } }) —
        // see auth (20/min) and practice answers (60/min). The old
        // auth/practice/challenge named buckets were merged into those
        // route-level defaults with identical numbers.
        throttlers: [
          {
            ttl: config.get('THROTTLE_TTL_SECONDS', { infer: true }) * 1000,
            limit: config.get('THROTTLE_LIMIT', { infer: true }),
          },
        ],
        storage: new RedisThrottlerStorage(redis, logger),
      }),
    }),
    CommonModule,
    PrismaModule,
    RedisModule,
    EmailModule,
    FeatureFlagsModule,
    QueueModule,
    StorageModule,
    HealthModule,
    AiModule,
    AuthModule,
    UsersModule,
    ProblemsModule,
    ProfileModule,
    CatalogModule,
    SubmissionsModule,
    FavoritesModule,
    ChallengeModule,
    RatingModule,
    ContestModule,
    LearningModule,
    LeaderboardModule,
    DiscussionModule,
    EventsModule,
    ContributionModule,
    FeedbackModule,
    RewardsModule,
    SearchModule,
    RecommendationsModule,
    NotificationModule,
    AdminModule,
    AnalyticsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    // Guard order is the request pipeline: throttle → authenticate →
    // authorize (roles) → authorize (permissions).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, OriginCheckMiddleware).forRoutes('*');
  }
}
