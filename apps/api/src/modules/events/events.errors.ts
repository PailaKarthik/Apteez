import { AppError } from '../../common/errors/app-error';

export class EventNotFoundError extends AppError {
  constructor(message = 'Event not found.') {
    super('NOT_FOUND', message, 404);
    this.name = 'EventNotFoundError';
  }
}

export class EventStateError extends AppError {
  constructor(message = 'This action is not allowed in the current event state.') {
    super('CONFLICT', message, 409);
    this.name = 'EventStateError';
  }
}

export class EventRegistrationError extends AppError {
  constructor(message = 'Registration is not available for this event.') {
    super('CONFLICT', message, 409);
    this.name = 'EventRegistrationError';
  }
}

export class EventNotRegisteredError extends AppError {
  constructor(message = 'Register for this event before entering.') {
    super('CONFLICT', message, 409);
    this.name = 'EventNotRegisteredError';
  }
}

export class EventExpiredError extends AppError {
  constructor(message = 'This event has ended. Your answers were finalized.') {
    super('CONFLICT', message, 409);
    this.name = 'EventExpiredError';
  }
}

export class EventQuestionError extends AppError {
  constructor(message = 'That event question is not available.') {
    super('NOT_FOUND', message, 404);
    this.name = 'EventQuestionError';
  }
}

export class EventForbiddenError extends AppError {
  constructor(message = 'You do not have access to this event.') {
    super('FORBIDDEN', message, 403);
    this.name = 'EventForbiddenError';
  }
}

export class EventValidationError extends AppError {
  constructor(message = 'Event data is incomplete.') {
    super('BAD_REQUEST', message, 400);
    this.name = 'EventValidationError';
  }
}
