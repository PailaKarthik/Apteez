import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { Public } from '../common/decorators/public.decorator';
import { StorageService } from './storage.service';

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
