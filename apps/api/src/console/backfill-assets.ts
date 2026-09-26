/**
 * Asset backfill console: `pnpm --filter @apteez/api assets:backfill`.
 *
 * Seeds and older writes can leave ProblemAsset / ProblemOption rows pointing
 * at keys with no bytes behind them (seed scripts never upload). This walks
 * every referenced image key and uploads a generated placeholder diagram for
 * the missing ones — through StorageService, so local dev and S3 buckets get
 * identical treatment. Real author uploads are never touched: only keys with
 * no bytes are written. Safe to re-run.
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { PrismaService, PrismaModule } from '@apteez/database';
import { validateEnv } from '../config/env';
import { StorageModule } from '../storage/storage.module';
import { StorageService } from '../storage/storage.service';
import { generatePlaceholderPng } from '../storage/placeholder-image';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    StorageModule,
  ],
})
class BackfillModule {}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif']);

function isImageKey(key: string): boolean {
  const lower = key.toLowerCase();
  const dot = lower.lastIndexOf('.');
  return dot >= 0 && IMAGE_EXTENSIONS.has(lower.slice(dot));
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(BackfillModule, { logger: ['error', 'warn', 'log'] });
  try {
    const prisma = app.get(PrismaService);
    const storage = app.get(StorageService);
    const [assets, options] = await Promise.all([
      prisma.problemAsset.findMany({ select: { objectKey: true } }),
      prisma.problemOption.findMany({
        where: { assetKey: { not: null } },
        select: { assetKey: true },
      }),
    ]);
    const keys = new Set<string>();
    for (const row of assets) {
      if (row.objectKey && isImageKey(row.objectKey)) {
        keys.add(row.objectKey);
      }
    }
    for (const row of options) {
      if (row.assetKey && isImageKey(row.assetKey)) {
        keys.add(row.assetKey);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[backfill] ${keys.size} image keys referenced; provider=${storage.providerName}`);
    const placeholder = generatePlaceholderPng();
    let created = 0;
    let present = 0;
    for (const key of keys) {
      if (await storage.exists(key)) {
        present += 1;
        continue;
      }
      await storage.upload({ key, body: placeholder, contentType: 'image/png' });
      created += 1;
      // eslint-disable-next-line no-console
      console.log(`[backfill] uploaded placeholder → ${key}`);
    }
    // eslint-disable-next-line no-console
    console.log(`[backfill] done: ${present} already present, ${created} placeholders uploaded.`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[backfill] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
