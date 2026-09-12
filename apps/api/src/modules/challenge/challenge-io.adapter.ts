import { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';
import type { Env } from '../../config/env';
import { parseCorsOrigins } from '../../config/env';

/**
 * Socket.IO adapter that applies the same environment-driven CORS allowlist
 * and cookie-based credential handling as the HTTP layer.
 */
export class ChallengeIoAdapter extends IoAdapter {
  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    const config = this.app.get(ConfigService<Env, true>);
    const origins = parseCorsOrigins(config.get('CORS_ORIGINS', { infer: true }));
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: origins, credentials: true },
    });
    return server;
  }
}
