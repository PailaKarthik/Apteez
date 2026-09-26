import * as Sentry from '@sentry/node';
import type { Env } from '../../config/env';

/**
 * Privacy-conscious Sentry bootstrap. No DSN means Sentry is never
 * initialized — zero behavior change, zero network calls. When configured:
 * scrubbed envelopes only (no cookies, auth headers, passwords, tokens,
 * OAuth secrets, or raw answers), user context limited to id + roles.
 */
export function initSentry(config: {
  dsn?: string;
  environment: string;
  version: string;
  tracesSampleRate: number;
}): void {
  if (!config.dsn) {
    return;
  }
  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.version,
    tracesSampleRate: config.tracesSampleRate,
    beforeSend(event) {
      const request = event.request as Record<string, unknown> | undefined;
      if (request && typeof request === 'object') {
        delete request.cookies;
        delete request.headers;
        request.data = undefined;
      }
      if (event.user) {
        const { id, username } = event.user as { id?: string; username?: string };
        event.user = { ...(id ? { id } : {}), ...(username ? { username } : {}) };
      }
      if (Array.isArray(event.breadcrumbs)) {
        event.breadcrumbs = event.breadcrumbs.map((crumb) => ({ ...crumb, data: undefined }));
      }
      return event;
    },
  });
}

export function sentryEnabled(): boolean {
  return Sentry.isInitialized?.() ?? false;
}

export function envOf(env: Env): {
  dsn?: string;
  environment: string;
  version: string;
  tracesSampleRate: number;
} {
  return {
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    version: env.APP_VERSION,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
  };
}
