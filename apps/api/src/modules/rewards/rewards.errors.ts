import { AppError } from '../../common/errors/app-error';

export class PointsRuleError extends AppError {
  constructor(message = 'This reward is not available.') {
    super('BAD_REQUEST', message, 400);
    this.name = 'PointsRuleError';
  }
}

export class PointsCapError extends AppError {
  constructor(message = 'Daily earning limit reached for this reward. Try again tomorrow.') {
    super('RATE_LIMITED', message, 429);
    this.name = 'PointsCapError';
  }
}

export class InsufficientPointsError extends AppError {
  constructor(message = 'Insufficient points balance.') {
    super('CONFLICT', message, 409);
    this.name = 'InsufficientPointsError';
  }
}

export class RewardNotAvailableError extends AppError {
  constructor(message = 'This reward is not available.') {
    super('CONFLICT', message, 409);
    this.name = 'RewardNotAvailableError';
  }
}

export class RedemptionNotFoundError extends AppError {
  constructor(message = 'Redemption not found.') {
    super('NOT_FOUND', message, 404);
    this.name = 'RedemptionNotFoundError';
  }
}

export class RedemptionStateError extends AppError {
  constructor(message = 'This redemption cannot transition to that state.') {
    super('CONFLICT', message, 409);
    this.name = 'RedemptionStateError';
  }
}
