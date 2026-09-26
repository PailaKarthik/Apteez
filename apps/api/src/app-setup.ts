import { VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { API_PREFIX, API_VERSION } from '@apteez/config';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppLogger } from './common/logger/app-logger';
import { type Env, parseCorsOrigins } from './config/env';
import { ChallengeIoAdapter } from './modules/challenge/challenge-io.adapter';

/**
 * Shared Express application wiring. Used by production bootstrap AND the
 * e2e suite so tests exercise the real middleware stack (cookie parsing
 * included — session cookies are unreadable without it).
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService<Env, true>);
  const logger = app.get(AppLogger);
  app.useLogger(logger);

  app.set('trust proxy', config.get('TRUST_PROXY', { infer: true }));
  // Explicit helmet posture (defaults verified, not blindly inherited):
  // - crossOriginResourcePolicy 'cross-origin': /storage serves intentionally
  //   public assets (avatars, question images) that the web origin embeds via
  //   <img>; same-origin would block them in browsers enforcing CORP.
  // - CSP is intentionally NOT enabled: the API serves JSON + raw bytes, and
  //   an incorrect policy risks breaking clients silently. Revisit if the API
  //   ever serves HTML.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use(cookieParser(config.get('COOKIE_SECRET', { infer: true })));

  // Bounded payloads; the frontend never needs larger bodies.
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));

  const origins = parseCorsOrigins(config.get('CORS_ORIGINS', { infer: true }));
  app.enableCors({ origin: origins, credentials: true, maxAge: 600 });

  app.setGlobalPrefix(API_PREFIX);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: API_VERSION });

  app.useWebSocketAdapter(new ChallengeIoAdapter(app));

  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  logger.log(
    `API configured on http://localhost:${port}/${API_PREFIX}/v${API_VERSION}`,
    'Bootstrap',
  );
}
