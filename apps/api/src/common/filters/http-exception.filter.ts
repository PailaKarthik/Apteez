import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import { type Request, type Response } from 'express';
import type { ApiErrorCode, ApiFieldError } from '@apteez/types';
import { AppError } from '../errors/app-error';
import { AppLogger } from '../logger/app-logger';

interface StructuredBody {
  statusCode?: number;
  code?: unknown;
  message?: unknown;
  details?: unknown;
}

function isStructuredBody(body: unknown): body is StructuredBody {
  return typeof body === 'object' && body !== null && 'code' in body;
}

function statusToCode(status: number): ApiErrorCode {
  if (status === 400) {
    return 'BAD_REQUEST';
  }
  if (status === 401) {
    return 'UNAUTHORIZED';
  }
  if (status === 403) {
    return 'FORBIDDEN';
  }
  if (status === 404) {
    return 'NOT_FOUND';
  }
  if (status === 409) {
    return 'CONFLICT';
  }
  if (status === 429) {
    return 'RATE_LIMITED';
  }
  if (status === 501) {
    return 'NOT_IMPLEMENTED';
  }
  if (status === 503) {
    return 'SERVICE_UNAVAILABLE';
  }
  return 'INTERNAL_ERROR';
}

function extractMessage(body: unknown, fallback: string): string {
  if (typeof body === 'string') {
    return body;
  }
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message)) {
      return message.map((part) => String(part)).join('; ');
    }
  }
  return fallback;
}

/**
 * Global exception filter. Every error leaving the API uses the shared
 * envelope `{ success: false, error: { statusCode, code, message,
 * details? }, requestId }`. Stack traces, driver errors and secrets are
 * logged server-side and never sent to clients.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & { id?: string }>();
    const response = ctx.getResponse<Response>();
    const requestId = request.id ?? 'unknown';

    let status = 500;
    let code: ApiErrorCode = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred.';
    let details: ApiFieldError[] | undefined;

    if (exception instanceof AppError) {
      status = exception.statusCode;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (isStructuredBody(body) && typeof body.code === 'string') {
        code = body.code as ApiErrorCode;
        message = extractMessage(body, message);
        if (Array.isArray(body.details)) {
          details = body.details as ApiFieldError[];
        }
      } else {
        code = statusToCode(status);
        message = extractMessage(body, message);
      }
    } else {
      const stack = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(`Unhandled error ${request.method} ${request.url}`, stack, 'Exceptions');
    }

    if (status >= 500 && !(exception instanceof AppError)) {
      this.logger.error(
        `Request failed ${request.method} ${request.url} -> ${status} (${code})`,
        exception instanceof Error ? exception.stack : undefined,
        'Exceptions',
      );
    } else if (status >= 400) {
      this.logger.warn(
        `Request rejected ${request.method} ${request.url} -> ${status} (${code})`,
        'Exceptions',
      );
    }

    response.status(status).json({
      success: false,
      error: {
        statusCode: status,
        code,
        message,
        ...(details ? { details } : {}),
      },
      requestId,
    });
  }
}
