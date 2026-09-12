import { AppError } from '../../common/errors/app-error';

export class LearningPathNotFoundError extends AppError {
  constructor(message = 'Learning path not found.') {
    super('NOT_FOUND', message, 404);
    this.name = 'LearningPathNotFoundError';
  }
}

export class LearningTopicNotFoundError extends AppError {
  constructor(message = 'Learning topic not found.') {
    super('NOT_FOUND', message, 404);
    this.name = 'LearningTopicNotFoundError';
  }
}

export class LearningLessonNotFoundError extends AppError {
  constructor(message = 'Learning lesson not found.') {
    super('NOT_FOUND', message, 404);
    this.name = 'LearningLessonNotFoundError';
  }
}

export class LearningUnpublishedError extends AppError {
  constructor(message = 'This learning content is not available yet.') {
    super('NOT_FOUND', message, 404);
    this.name = 'LearningUnpublishedError';
  }
}
