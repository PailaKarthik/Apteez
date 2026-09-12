import { AppError } from '../common/errors/app-error';

/**
 * Raised when a real-time operation cannot proceed because Redis is
 * unreachable. Callers must surface a controlled 503 instead of pretending
 * the operation succeeded — Redis coordination is never silently skipped.
 */
export class RedisUnavailableError extends AppError {
  constructor(
    message = 'Real-time services are temporarily unavailable. Please try again shortly.',
  ) {
    super('SERVICE_UNAVAILABLE', message, 503);
    this.name = 'RedisUnavailableError';
  }
}
