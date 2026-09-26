import { ForbiddenException, Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import type { Env } from '../../config/env';
import { parseCorsOrigins } from '../../config/env';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Loopback aliases for the same machine. Developers constantly open the app
 * as `127.0.0.1:3000` instead of `localhost:3000` (same for `[::1]`); without
 * this, every mutation from those tabs dies with 403 "Cross-origin request
 * refused" while reads keep working — indistinguishable from a broken API.
 * Scheme and port must still match exactly; only the loopback hostname is
 * treated as equivalent. Production origins are unaffected.
 */
function normalizeLoopback(origin: string): string | null {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  let host = url.hostname.toLowerCase();
  if (host === '127.0.0.1' || host === '::1' || host === '[::1]') {
    host = 'localhost';
  }
  return `${url.protocol}//${host}${url.port ? `:${url.port}` : ''}`;
}

/**
 * CSRF defense for cookie-authenticated mutations. Browsers always attach an
 * Origin (fetch) or Referer (navigation) header; requests carrying one from
 * outside the allowlist are rejected. Headerless clients (mobile apps, curl,
 * server-to-server) pass through — they cannot be CSRF victims.
 */
@Injectable()
export class OriginCheckMiddleware implements NestMiddleware {
  private readonly allowedOrigins: Set<string>;

  constructor(config: ConfigService<Env, true>) {
    const origins = new Set<string>([config.get('APP_URL', { infer: true })]);
    for (const origin of parseCorsOrigins(config.get('CORS_ORIGINS', { infer: true }))) {
      origins.add(origin.replace(/\/$/, ''));
    }
    // Compare loopback-normalized forms so 127.0.0.1/[::1] tabs match a
    // localhost allowlist entry (and vice versa).
    this.allowedOrigins = new Set(
      [...origins].map((origin) => normalizeLoopback(origin) ?? origin),
    );
  }

  use(req: Request, _res: Response, next: NextFunction): void {
    if (!MUTATING_METHODS.has(req.method)) {
      next();
      return;
    }
    const originHeader = req.headers.origin;
    const refererHeader = req.headers.referer;
    if (!originHeader && !refererHeader) {
      next();
      return;
    }
    const candidates = [originHeader, refererHeader].filter(
      (value): value is string => typeof value === 'string',
    );
    for (const candidate of candidates) {
      const origin = normalizeLoopback(candidate);
      if (!origin || !this.allowedOrigins.has(origin)) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'FORBIDDEN',
          message: 'Cross-origin request refused.',
        });
      }
    }
    next();
  }
}
