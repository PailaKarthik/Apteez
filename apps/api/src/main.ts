import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './app-setup';
import { AppLogger } from './common/logger/app-logger';
import { initSentry } from './common/observability/sentry';
import type { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  configureApp(app);
  const earlyConfig = app.get(ConfigService<Env, true>);
  initSentry({
    dsn: earlyConfig.get('SENTRY_DSN', { infer: true }),
    environment: earlyConfig.get('NODE_ENV', { infer: true }),
    version: earlyConfig.get('APP_VERSION', { infer: true }),
    tracesSampleRate: earlyConfig.get('SENTRY_TRACES_SAMPLE_RATE', { infer: true }),
  });

  const config = app.get(ConfigService<Env, true>);
  const logger = app.get(AppLogger);
  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
  logger.log(`API listening on port ${port}`, 'Bootstrap');
}

void bootstrap();
