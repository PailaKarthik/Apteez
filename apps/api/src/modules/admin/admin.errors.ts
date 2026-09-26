import { AppError } from '../../common/errors/app-error';

export class AdminForbiddenError extends AppError {
  constructor(message = 'Admin access is required.') {
    super('FORBIDDEN', message, 403);
    this.name = 'AdminForbiddenError';
  }
}

export class AdminNotFoundError extends AppError {
  constructor(message = 'Resource not found.') {
    super('NOT_FOUND', message, 404);
    this.name = 'AdminNotFoundError';
  }
}

export class AdminConflictError extends AppError {
  constructor(message = 'This action is not allowed in the current state.') {
    super('CONFLICT', message, 409);
    this.name = 'AdminConflictError';
  }
}

export class AdminValidationError extends AppError {
  constructor(message = 'Admin request is invalid.') {
    super('BAD_REQUEST', message, 400);
    this.name = 'AdminValidationError';
  }
}
