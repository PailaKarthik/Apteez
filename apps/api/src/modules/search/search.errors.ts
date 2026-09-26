import { AppError } from '../../common/errors/app-error';

export class InvalidSearchCursorError extends AppError {
  constructor(message = 'This search cursor is invalid or belongs to a different query.') {
    super('VALIDATION_ERROR', message, 400);
    this.name = 'InvalidSearchCursorError';
  }
}

export class SearchNotImplementedError extends AppError {
  constructor(
    message = 'Semantic similarity arrives with the RAG pipeline; lexical search covers this surface today.',
  ) {
    super('NOT_IMPLEMENTED', message, 501);
    this.name = 'SearchNotImplementedError';
  }
}
