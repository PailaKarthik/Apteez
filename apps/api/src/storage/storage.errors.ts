import { AppError } from '../common/errors/app-error';

export class StorageUploadError extends AppError {
  constructor(message = 'Upload failed.') {
    super('BAD_REQUEST', message, 400);
    this.name = 'StorageUploadError';
  }
}
