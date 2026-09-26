import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AppLogger } from './common/logger/app-logger';
import { initSentry } from './common/observability/sentry';
import type { Env } from './config/env';

/**
 * Standalone BullMQ worker entrypoint (`node dist/worker`).
 *
 * Boots the same AppModule as the HTTP API but as an application context:
 * no HTTP listener, no Socket.IO server — only the queue processors
 * (challenge, event notifications, AI embeddings/reviews) plus the domain
 * services they call. BullMQ distributes jobs across API and worker
 * processes; every handler is idempotent, so overlap during deploys is safe.
 *
 * Socket pushes still originate from the API process (gateway interactions);
 * job handlers only commit authoritative PostgreSQL/Redis state, which is
 * identical regardless of which process runs them.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  const config = app.get(ConfigService<Env, true>);
  const logger = app.get(AppLogger);
  app.useLogger(logger);
  initSentry({
    dsn: config.get('SENTRY_DSN', { infer: true }),
    environment: config.get('NODE_ENV', { infer: true }),
    version: config.get('APP_VERSION', { infer: true }),
    tracesSampleRate: config.get('SENTRY_TRACES_SAMPLE_RATE', { infer: true }),
  });

  app.enableShutdownHooks();
  const shutdown = async (signal: string): Promise<void> => {
    logger.log(`Worker received ${signal}; draining…`, 'Worker');
    try {
      await app.close();
    } finally {
      logger.log('Worker shut down cleanly', 'Worker');
    }
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  logger.log(
    `Worker online (env=${config.get('NODE_ENV', { infer: true })}) — waiting for BullMQ jobs`,
    'Worker',
  );
}

void bootstrap();
