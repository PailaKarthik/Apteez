import type { ApiErrorCode, ApiFieldError } from '@apteez/types';

/**
 * Base class for expected application errors. Carries the machine-readable
 * `code` clients switch on, so domain errors never leak as plain 500s.
 * Authentication, scoring, review and billing flows in later prompts should
 * throw subclasses of this instead of raw HttpExceptions.
 */
export class AppError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: ApiFieldError[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Thrown by module boundaries whose business logic lands in a later prompt. */
export class NotImplementedError extends AppError {
  constructor(feature = 'This feature') {
    super('NOT_IMPLEMENTED', `${feature} is not implemented yet.`, 501);
    this.name = 'NotImplementedError';
  }
}
