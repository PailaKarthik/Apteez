import { AppError } from '../../common/errors/app-error';

export class RatingDomainNotFoundError extends AppError {
  constructor(message = 'That rating domain is not available.') {
    super('NOT_FOUND', message, 404);
    this.name = 'RatingDomainNotFoundError';
  }
}

export class RatingUserNotFoundError extends AppError {
  constructor(message = 'That user could not be found.') {
    super('NOT_FOUND', message, 404);
    this.name = 'RatingUserNotFoundError';
  }
}

/**
 * Raised when a challenge is not in a state that can produce a rating. This is
 * a programming/coordination error, never a user-facing one — it means rating
 * processing was invoked before the challenge was finalized.
 */
export class RatingNotEligibleError extends AppError {
  constructor(message = 'This challenge is not eligible for rating.') {
    super('CONFLICT', message, 409);
    this.name = 'RatingNotEligibleError';
  }
}
