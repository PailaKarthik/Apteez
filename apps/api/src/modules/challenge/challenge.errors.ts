import { AppError } from '../../common/errors/app-error';

export class ChallengeNotFoundError extends AppError {
  constructor(message = 'Challenge not found.') {
    super('NOT_FOUND', message, 404);
    this.name = 'ChallengeNotFoundError';
  }
}

export class ChallengeStateError extends AppError {
  constructor(message = 'This action is not allowed in the current challenge state.') {
    super('CONFLICT', message, 409);
    this.name = 'ChallengeStateError';
  }
}

export class MatchmakingBusyError extends AppError {
  constructor(message = 'You already have an active matchmaking request or challenge.') {
    super('CONFLICT', message, 409);
    this.name = 'MatchmakingBusyError';
  }
}

export class DomainUnavailableError extends AppError {
  constructor(message = 'This challenge domain is not available.') {
    super('NOT_FOUND', message, 404);
    this.name = 'DomainUnavailableError';
  }
}

export class QuestionNotActiveError extends AppError {
  constructor(message = 'That question is not currently available to answer.') {
    super('CONFLICT', message, 409);
    this.name = 'QuestionNotActiveError';
  }
}

export class ReadingTimeError extends AppError {
  constructor(message = 'Give the question a moment before answering.') {
    super('CONFLICT', message, 409);
    this.name = 'ReadingTimeError';
  }
}

export class QuestionExpiredError extends AppError {
  constructor(message = 'This question has already been answered.') {
    super('CONFLICT', message, 409);
    this.name = 'QuestionExpiredError';
  }
}
