import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { AuthRequiredError } from '../modules/auth/auth.errors';
import { StorageUploadError } from './storage.errors';
import { StorageService } from './storage.service';

export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

/** Claimed type → file extension + magic-byte signature. SVG is never allowed. */
const IMAGE_SIGNATURES: Record<string, { ext: string }> = {
  'image/jpeg': { ext: 'jpg' },
  'image/png': { ext: 'png' },
  'image/webp': { ext: 'webp' },
  'image/gif': { ext: 'gif' },
  'image/avif': { ext: 'avif' },
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function matchesImageSignature(buffer: Buffer, mimetype: string): boolean {
  if (buffer.length < 12) {
    return false;
  }
  if (mimetype === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimetype === 'image/png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }
  if (mimetype === 'image/webp') {
    return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  if (mimetype === 'image/gif') {
    const header = buffer.toString('ascii', 0, 6);
    return header === 'GIF87a' || header === 'GIF89a';
  }
  if (mimetype === 'image/avif') {
    return buffer.toString('ascii', 4, 8) === 'ftyp' && buffer.toString('ascii', 8, 12) === 'avif';
  }
  return false;
}

// SVGs are deliberately absent: no upload path accepts SVG (avatar mime
// allowlist + magic-byte check), so a stray .svg can never execute inline —
// it falls through to application/octet-stream below.
const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.pdf': 'application/pdf',
};

/**
 * Read-only asset delivery for the local storage provider (development).
 * Production uses S3-compatible storage and presigned URLs, so this route
 * simply 404s when a remote provider is configured.
 */
@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  /**
   * Upload one question/content image (signed-in users: admins authoring
   * problems, members contributing). Returns the storage key plus a
   * ready-to-render URL — clients pass the key back when creating the
   * problem/option, never raw bytes, so large payloads stay out of JSON.
   */
  @Post('uploads')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
      fileFilter: (_req, file: { mimetype: string }, callback) => {
        if (IMAGE_SIGNATURES[file.mimetype]) {
          callback(null, true);
        } else {
          callback(
            new StorageUploadError('Only JPEG, PNG, WebP, GIF and AVIF images are supported.'),
            false,
          );
        }
      },
    }),
  )
  async uploadImage(
    @UploadedFile() file: UploadedImage | undefined,
    @CurrentUser() user?: RequestUser,
  ): Promise<{ key: string; url: string; contentType: string; size: number }> {
    if (!user) {
      throw new AuthRequiredError('Sign in to upload images.');
    }
    if (!file || !file.buffer || file.size === 0) {
      throw new StorageUploadError('Attach one image file (max 5 MB).');
    }
    const signature = IMAGE_SIGNATURES[file.mimetype];
    if (!signature || !matchesImageSignature(file.buffer, file.mimetype)) {
      throw new StorageUploadError('That file is not a valid image.');
    }
    const key = `questions/${randomUUID()}/${randomUUID()}.${signature.ext}`;
    const stored = await this.storage.upload({
      key,
      body: file.buffer,
      contentType: file.mimetype,
    });
    const url = await this.storage.getDownloadUrl(stored.key);
    return { key: stored.key, url, contentType: file.mimetype, size: stored.size };
  }

  @Public()
  @Get('*')
  async serve(@Param() params: Record<string, string>, @Res() res: Response): Promise<void> {
    const key = params['0'] ?? '';
    let handle: { absolutePath: string } | null = null;
    try {
      handle = key ? this.storage.getLocalFile(key) : null;
    } catch {
      // sanitizeKey rejects traversal/empty keys — indistinguishable from
      // a missing asset to callers.
      handle = null;
    }
    if (!handle) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Asset not found.',
      });
    }

    let size: number;
    try {
      const info = await stat(handle.absolutePath);
      if (!info.isFile()) {
        throw new Error('not a file');
      }
      size = info.size;
    } catch {
      throw new NotFoundException({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Asset not found.',
      });
    }

    res.setHeader(
      'Content-Type',
      CONTENT_TYPES[extname(key).toLowerCase()] ?? 'application/octet-stream',
    );
    res.setHeader('Content-Length', String(size));
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    createReadStream(handle.absolutePath).pipe(res);
  }
}
