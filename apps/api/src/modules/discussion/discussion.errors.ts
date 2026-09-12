import { AppError } from '../../common/errors/app-error';

export class DiscussionThreadNotFoundError extends AppError {
  constructor(message = 'Discussion thread not found.') {
    super('NOT_FOUND', message, 404);
    this.name = 'DiscussionThreadNotFoundError';
  }
}

export class DiscussionReplyNotFoundError extends AppError {
  constructor(message = 'Discussion reply not found.') {
    super('NOT_FOUND', message, 404);
    this.name = 'DiscussionReplyNotFoundError';
  }
}

export class DiscussionLockedError extends AppError {
  constructor(message = 'This thread is locked and no longer accepts replies.') {
    super('CONFLICT', message, 409);
    this.name = 'DiscussionLockedError';
  }
}

export class DiscussionForbiddenError extends AppError {
  constructor(message = 'You are not allowed to modify this discussion.') {
    super('FORBIDDEN', message, 403);
    this.name = 'DiscussionForbiddenError';
  }
}

export class DiscussionDuplicateReportError extends AppError {
  constructor(message = 'You have already reported this content.') {
    super('CONFLICT', message, 409);
    this.name = 'DiscussionDuplicateReportError';
  }
}

export class DiscussionInvalidTargetError extends AppError {
  constructor(message = 'A reaction or report must target exactly one post or reply.') {
    super('BAD_REQUEST', message, 400);
    this.name = 'DiscussionInvalidTargetError';
  }
}