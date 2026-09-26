import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  sanitizeKey,
  type StorageProvider,
  type StoredObject,
  type UploadInput,
} from '../storage.types';

/**
 * Filesystem provider for local development. Never used in production;
 * keeps local setup free of cloud dependencies.
 *
 * Download URLs are minted against the API's public base URL so clients
 * never learn a filesystem path; the StorageController streams the bytes.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local' as const;

  constructor(
    private readonly rootDir: string,
    private readonly publicBaseUrl: string,
  ) {}

  private resolveKey(key: string): string {
    const safeKey = sanitizeKey(key);
    const root = resolve(this.rootDir);
    const absolute = resolve(root, safeKey);
    if (
      absolute !== root &&
      !absolute.startsWith(`${root}/`) &&
      !absolute.startsWith(`${root}\\`)
    ) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return absolute;
  }

  /** Absolute path for the read-only streaming controller. */
  resolveAbsolutePath(key: string): string {
    return this.resolveKey(key);
  }

  async upload(input: UploadInput): Promise<StoredObject> {
    const absolute = this.resolveKey(input.key);
    await mkdir(dirname(absolute), { recursive: true });
    const body =
      typeof input.body === 'string' ? Buffer.from(input.body, 'utf8') : Buffer.from(input.body);
    await writeFile(absolute, body);
    return { key: sanitizeKey(input.key), size: body.length, contentType: input.contentType };
  }

  async getDownloadUrl(key: string): Promise<string> {
    const safeKey = sanitizeKey(key);
    return `${this.publicBaseUrl.replace(/\/$/, '')}/api/v1/storage/${safeKey}`;
  }

  async createReadStream(key: string): Promise<ReadStream> {
    return createReadStream(this.resolveKey(key));
  }

  async delete(key: string): Promise<void> {
    const absolute = this.resolveKey(key);
    try {
      await stat(absolute);
    } catch {
      return;
    }
    await unlink(absolute);
  }

  async exists(key: string): Promise<boolean> {
    let absolute: string;
    try {
      absolute = this.resolveKey(key);
    } catch {
      return false;
    }
    try {
      const info = await stat(absolute);
      return info.isFile();
    } catch {
      return false;
    }
  }
}

export function defaultLocalDir(cwd = process.cwd()): string {
  return join(cwd, '.data', 'storage');
}
