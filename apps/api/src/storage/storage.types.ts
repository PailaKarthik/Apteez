/**
 * Provider-agnostic object storage contract. Business logic depends only on
 * this interface (via StorageService); the S3-compatible and local
 * implementations are interchangeable and selected by configuration, so the
 * platform is never coupled to one storage vendor.
 */
export interface UploadInput {
  /** Storage key, e.g. `questions/<id>/diagram.png`. */
  key: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
}

export interface StoredObject {
  key: string;
  size: number;
  contentType: string;
}

export interface StorageProvider {
  readonly name: 'local' | 's3';
  upload(input: UploadInput): Promise<StoredObject>;
  getDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}

/** DI token for the configured storage provider. */
export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

/** Reject path traversal and absolute keys before touching any backend. */
export function sanitizeKey(key: string): string {
  const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0 || segments.some((segment) => segment === '..')) {
    throw new Error(`Invalid storage key: ${key}`);
  }
  return segments.join('/');
}
