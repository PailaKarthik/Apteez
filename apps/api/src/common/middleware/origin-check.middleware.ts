import { ForbiddenException, Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import type { Env } from '../../config/env';
import { parseCorsOrigins } from '../../config/env';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

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
    this.allowedOrigins = origins;
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
      let origin: string;
      try {
        origin = new URL(candidate).origin;
      } catch {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'FORBIDDEN',
          message: 'Cross-origin request refused.',
        });
      }
      if (!this.allowedOrigins.has(origin)) {
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
