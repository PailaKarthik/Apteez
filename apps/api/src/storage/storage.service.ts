import { Inject, Injectable } from '@nestjs/common';
import { LocalStorageProvider } from './providers/local-storage.provider';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
  type StoredObject,
  type UploadInput,
} from './storage.types';

export interface LocalFileHandle {
  absolutePath: string;
}

/**
 * Application-facing storage service. Feature modules inject this (never a
 * concrete provider) to store question images, avatars, event assets, …
 *
 * Asset URLs are always minted here — database rows only ever hold keys.
 */
@Injectable()
export class StorageService {
  constructor(@Inject(STORAGE_PROVIDER) private readonly provider: StorageProvider) {}

  /** Which backend is active (`local` in dev, `s3` in AWS-compatible envs). */
  get providerName(): StorageProvider['name'] {
    return this.provider.name;
  }

  upload(input: UploadInput): Promise<StoredObject> {
    return this.provider.upload(input);
  }

  getDownloadUrl(key: string, expiresInSeconds?: number): Promise<string> {
    return this.provider.getDownloadUrl(key, expiresInSeconds);
  }

  delete(key: string): Promise<void> {
    return this.provider.delete(key);
  }

  /** True when readable bytes exist behind the key (backfills, health checks). */
  exists(key: string): Promise<boolean> {
    return this.provider.exists(key);
  }

  /** Batch URL minting for list/detail projections (no N+1). */
  async getDownloadUrls(keys: readonly string[]): Promise<Map<string, string>> {
    const unique = [...new Set(keys)];
    // Fault-tolerant by design: one missing/invalid key (deleted object,
    // stale DB reference, transient S3 signing blip after deploy) must never
    // 500 the whole problem/profile payload. Failed keys are simply absent —
    // callers fall back to ''/null per asset.
    const settled = await Promise.allSettled(
      unique.map(async (key) => [key, await this.getDownloadUrl(key)] as const),
    );
    const resolved: Array<readonly [string, string]> = [];
    for (const entry of settled) {
      if (entry.status === 'fulfilled') {
        resolved.push(entry.value);
      }
    }
    return new Map(resolved);
  }

  /**
   * Local development only: hand the streaming controller a filesystem path.
   * Returns null for remote providers (S3 serves via presigned URLs instead).
   */
  getLocalFile(key: string): LocalFileHandle | null {
    if (!(this.provider instanceof LocalStorageProvider)) {
      return null;
    }
    return { absolutePath: this.provider.resolveAbsolutePath(key) };
  }
}
