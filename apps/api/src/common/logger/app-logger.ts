import { Injectable, type LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { getRequestId } from '../context/request-context';
import { redactSecrets, redactString } from './log-redact';

type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'verbose';

const LEVEL_ORDER: Record<LogLevel, number> = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  verbose: 5,
};

/**
 * Structured application logger. Production emits JSON lines (one object per
 * line, safe to ship to any log aggregator); development prints a compact
 * human-readable line. Every entry carries the request id when one exists.
 */
@Injectable()
export class AppLogger implements LoggerService {
  private readonly minLevel: LogLevel;
  private readonly production: boolean;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.minLevel = this.config.get('LOG_LEVEL', { infer: true });
    this.production = this.config.get('NODE_ENV', { infer: true }) === 'production';
  }

  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    const [stack, context] = this.splitErrorParams(optionalParams);
    this.write('error', message, typeof context === 'string' ? context : undefined, stack);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context);
  }

  fatal(message: unknown, context?: string): void {
    this.write('fatal', message, context);
  }

  private splitErrorParams(params: unknown[]): [string | undefined, unknown] {
    if (params.length === 0) {
      return [undefined, undefined];
    }
    if (params.length === 1) {
      return typeof params[0] === 'string'
        ? [undefined, params[0]]
        : [String(params[0]), undefined];
    }
    const [stack, context] = params;
    return [typeof stack === 'string' ? stack : String(stack), context];
  }

  private write(level: LogLevel, message: unknown, context?: string, stack?: string): void {
    if (LEVEL_ORDER[level] > LEVEL_ORDER[this.minLevel]) {
      return;
    }
    // Central redaction: every line is scrubbed before it reaches stdout, the
    // aggregator, or Sentry breadcrumbs. Telemetry counters and ids pass
    // through; credentials, tokens, cookies and connection strings do not.
    const text =
      typeof message === 'string' ? redactString(message) : JSON.stringify(redactSecrets(message));
    const safeStack = stack ? redactString(stack) : undefined;
    const requestId = getRequestId();
    if (this.production) {
      const entry: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        level,
        context: context ?? 'Application',
        message: text,
      };
      if (requestId) {
        entry.requestId = requestId;
      }
      if (safeStack) {
        entry.stack = safeStack;
      }
      const line = JSON.stringify(entry);
      if (level === 'error' || level === 'fatal' || level === 'warn') {
        process.stderr.write(`${line}\n`);
      } else {
        process.stdout.write(`${line}\n`);
      }
      return;
    }
    const suffix = requestId ? ` [${requestId}]` : '';
    const formatted = `[${context ?? 'Application'}]${suffix} ${text}`;
    if (level === 'error' || level === 'fatal') {
      console.error(formatted);
      if (safeStack) {
        console.error(safeStack);
      }
    } else if (level === 'warn') {
      console.warn(formatted);
    } else {
      // eslint-disable-next-line no-console -- human-readable dev output by design
      console.log(formatted);
    }
  }
}
