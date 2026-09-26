import { AppError } from '../../common/errors/app-error';

export class ProfileNotFoundError extends AppError {
  constructor(message = 'Profile not found.') {
    super('NOT_FOUND', message, 404);
    this.name = 'ProfileNotFoundError';
  }
}

export class ProfileForbiddenError extends AppError {
  constructor(message = 'You do not have access to this profile.') {
    super('FORBIDDEN', message, 403);
    this.name = 'ProfileForbiddenError';
  }
}

export class ProfileValidationError extends AppError {
  constructor(message = 'Profile data is invalid.') {
    super('BAD_REQUEST', message, 400);
    this.name = 'ProfileValidationError';
  }
}

export class AvatarUploadError extends AppError {
  constructor(message = 'Avatar upload failed.') {
    super('BAD_REQUEST', message, 400);
    this.name = 'AvatarUploadError';
  }
}
