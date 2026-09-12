import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Shared Prisma client with NestJS lifecycle hooks.
 *
 * Connection is explicit (fail fast on boot when PostgreSQL is down) and
 * torn down through the shutdown hooks enabled in main.ts. `ping()` backs
 * the /health database check without exposing connection details.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch {
      // Boot stays resilient: Prisma reconnects on demand and /health
      // reports the outage until PostgreSQL is reachable.
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Lightweight liveness probe used by the health endpoint. */
  async ping(): Promise<number> {
    const startedAt = Date.now();
    await this.$queryRaw`SELECT 1`;
    return Date.now() - startedAt;
  }
}
