import { AppError } from '../../common/errors/app-error';

export class ContributionNotFoundError extends AppError {
  constructor(message = 'Contribution not found.') {
    super('NOT_FOUND', message, 404);
    this.name = 'ContributionNotFoundError';
  }
}

export class ContributionStateError extends AppError {
  constructor(message = 'This action is not allowed in the current contribution state.') {
    super('CONFLICT', message, 409);
    this.name = 'ContributionStateError';
  }
}
