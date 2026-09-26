import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  sanitizeKey,
  type StorageProvider,
  type StoredObject,
  type UploadInput,
} from '../storage.types';

export interface S3StorageOptions {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/**
 * S3-compatible provider (AWS S3, Cloudflare R2, …). The frontend never
 * builds these URLs itself — it only ever uses URLs minted here.
 */
export class S3StorageProvider implements StorageProvider {
  readonly name = 's3' as const;
  private readonly client: S3Client;

  constructor(private readonly options: S3StorageOptions) {
    this.client = new S3Client({
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      region: options.region,
      forcePathStyle: options.forcePathStyle,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async upload(input: UploadInput): Promise<StoredObject> {
    const key = sanitizeKey(input.key);
    const body =
      typeof input.body === 'string' ? Buffer.from(input.body, 'utf8') : Buffer.from(input.body);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Body: body,
        ContentType: input.contentType,
      }),
    );
    return { key, size: body.length, contentType: input.contentType };
  }

  async getDownloadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.options.bucket, Key: sanitizeKey(key) }),
      { expiresIn: expiresInSeconds },
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.options.bucket, Key: sanitizeKey(key) }),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.options.bucket, Key: sanitizeKey(key) }),
      );
      return true;
    } catch {
      return false;
    }
  }
}
