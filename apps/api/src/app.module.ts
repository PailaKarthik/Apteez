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
import { HealthModule } from './health/health.module';
import { RedisModule } from './redis/redis.module';
import { StorageModule } from './storage/storage.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { ChallengeModule } from './modules/challenge/challenge.module';
import { ContestModule } from './modules/contest/contest.module';
import { ContributionModule } from './modules/contribution/contribution.module';
import { DiscussionModule } from './modules/discussion/discussion.module';
import { EventsModule } from './modules/events/events.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { LeaderboardModule } from './modules/leaderboard/leaderboard.module';
import { LearningModule } from './modules/learning/learning.module';
import { NotificationModule } from './modules/notification/notification.module';
import { ProblemsModule } from './modules/problems/problems.module';
import { QueueModule } from './queue/queue.module';
import { RatingModule } from './modules/rating/rating.module';
import { RewardsModule } from './modules/rewards/rewards.module';
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
        throttlers: [
          {
            ttl: config.get('THROTTLE_TTL_SECONDS', { infer: true }) * 1000,
            limit: config.get('THROTTLE_LIMIT', { infer: true }),
          },
          {
            name: 'auth',
            ttl: config.get('AUTH_RATE_WINDOW_SECONDS', { infer: true }) * 1000,
            limit: config.get('AUTH_RATE_LIMIT', { infer: true }),
          },
          {
            name: 'practice',
            ttl: config.get('PRACTICE_RATE_WINDOW_SECONDS', { infer: true }) * 1000,
            limit: config.get('PRACTICE_RATE_LIMIT', { infer: true }),
          },
          {
            name: 'challenge',
            ttl: config.get('CHALLENGE_RATE_WINDOW_SECONDS', { infer: true }) * 1000,
            limit: config.get('CHALLENGE_RATE_LIMIT', { infer: true }),
          },
        ],
        storage: new RedisThrottlerStorage(redis, logger),
      }),
    }),
    CommonModule,
    PrismaModule,
    RedisModule,
    QueueModule,
    StorageModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ProblemsModule,
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
    RewardsModule,
    NotificationModule,
    AdminModule,
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
