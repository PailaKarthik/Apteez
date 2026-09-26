import { AppError } from '../../common/errors/app-error';

export class ContestNotFoundError extends AppError {
  constructor(message = 'Contest not found.') {
    super('NOT_FOUND', message, 404);
    this.name = 'ContestNotFoundError';
  }
}

export class ContestStateError extends AppError {
  constructor(message = 'This action is not allowed in the current contest state.') {
    super('CONFLICT', message, 409);
    this.name = 'ContestStateError';
  }
}

export class ContestRegistrationError extends AppError {
  constructor(message = 'Registration is not available for this contest.') {
    super('CONFLICT', message, 409);
    this.name = 'ContestRegistrationError';
  }
}

export class ContestNotRegisteredError extends AppError {
  constructor(message = 'Register for this contest before entering.') {
    super('CONFLICT', message, 409);
    this.name = 'ContestNotRegisteredError';
  }
}

export class ContestExpiredError extends AppError {
  constructor(message = 'This contest has ended. Your answers were finalized.') {
    super('CONFLICT', message, 409);
    this.name = 'ContestExpiredError';
  }
}

export class ContestQuestionError extends AppError {
  constructor(message = 'That contest question is not available.') {
    super('NOT_FOUND', message, 404);
    this.name = 'ContestQuestionError';
  }
}

export class ContestForbiddenError extends AppError {
  constructor(message = 'Only an admin can do this.') {
    super('FORBIDDEN', message, 403);
    this.name = 'ContestForbiddenError';
  }
}
