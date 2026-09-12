import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { LocalStorageProvider, defaultLocalDir } from './providers/local-storage.provider';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { STORAGE_PROVIDER, type StorageProvider } from './storage.types';

function createProvider(config: ConfigService<Env, true>): StorageProvider {
  if (config.get('STORAGE_PROVIDER', { infer: true }) === 's3') {
    return new S3StorageProvider({
      endpoint: config.get('S3_ENDPOINT', { infer: true }),
      region: config.get('S3_REGION', { infer: true }),
      bucket: config.get('S3_BUCKET', { infer: true }) ?? '',
      accessKeyId: config.get('S3_ACCESS_KEY_ID', { infer: true }) ?? '',
      secretAccessKey: config.get('S3_SECRET_ACCESS_KEY', { infer: true }) ?? '',
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
    });
  }
  return new LocalStorageProvider(
    config.get('STORAGE_LOCAL_DIR', { infer: true }) || defaultLocalDir(),
    config.get('API_URL', { infer: true }),
  );
}

/** Global object-storage access; feature modules inject StorageService. */
@Global()
@Module({
  controllers: [StorageController],
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: createProvider,
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
