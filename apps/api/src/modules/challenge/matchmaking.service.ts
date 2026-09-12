import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import { randomUUID } from 'node:crypto';
import { AppLogger } from '../../common/logger/app-logger';
import { redisKeys } from '../../redis/redis-keys';
import { RedisLockService } from '../../redis/redis-lock.service';
import { RedisService } from '../../redis/redis.service';
import { DomainUnavailableError, MatchmakingBusyError } from './challenge.errors';
import { MATCHMAKING_STALE_SECONDS } from './challenge.config';

export interface QueuedPlayer {
  requestId: string;
  userId: string;
  domainSlug: string;
  rating: number;
  queuedAt: number;
}

export interface MatchPair {
  requestId: string;
  player1: QueuedPlayer;
  player2: QueuedPlayer;
}

const MATCH_LOCK_TTL_MS = 5_000;

const CLAIM_SCRIPT = `
local a = redis.call('HGET', KEYS[1], ARGV[1])
local b = redis.call('HGET', KEYS[1], ARGV[2])
if a and b then
  redis.call('HDEL', KEYS[1], ARGV[1], ARGV[2])
  return 1
end
return 0
`;

/**
 * Redis-backed matchmaking. All state is ephemeral — permanent challenge rows
 * are written to PostgreSQL only after a pair is matched.
 *
 * Integrity guarantees:
 * - one queue entry per user (the `matchmaking:user:<id>` pointer is
 *   authoritative, and a user with a live challenge cannot enqueue at all);
 * - self-match is impossible (the scanner skips the requester's own entry);
 * - a pair is claimed by a single Lua compare-and-delete under a distributed
 *   lock, so two consumers can never create two challenges for one pairing;
 * - stale entries are pruned both inline (before use) and by a background sweep.
 */
@Injectable()
export class MatchmakingService {
  constructor(
    private readonly redis: RedisService,
    private readonly lock: RedisLockService,
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  private now(): number {
    return Date.now();
  }

  async enqueue(userId: string, domainSlug: string): Promise<QueuedPlayer> {
    await this.redis.requireReady();
    const existing = await this.getActiveRequest(userId);
    if (existing) {
      return existing;
    }

    const activeChallenge = await this.prisma.challenge.findFirst({
      where: {
        OR: [{ player1Id: userId }, { player2Id: userId }],
        status: { in: ['MATCHMAKING', 'MATCHED', 'COUNTDOWN', 'LIVE'] },
      },
      select: { id: true },
    });
    if (activeChallenge) {
      throw new MatchmakingBusyError();
    }

    const category = await this.prisma.category.findFirst({
      where: { slug: domainSlug, isActive: true },
      select: { id: true },
    });
    if (!category) {
      throw new DomainUnavailableError();
    }
    const rating = await this.getRating(userId, domainSlug);
    const player: QueuedPlayer = {
      requestId: randomUUID(),
      userId,
      domainSlug,
      rating,
      queuedAt: this.now(),
    };
    const client = this.redis.getClient();
    await client
      .multi()
      .hset(redisKeys.matchmakingQueue(domainSlug), player.requestId, JSON.stringify(player))
      .set(
        redisKeys.matchmakingUser(userId),
        JSON.stringify(player),
        'EX',
        MATCHMAKING_STALE_SECONDS,
      )
      .expire(redisKeys.matchmakingQueue(domainSlug), MATCHMAKING_STALE_SECONDS)
      .exec();
    this.logger.log(
      `challenge.matchmaking.enqueue userId=${userId} domain=${domainSlug} request=${player.requestId}`,
      'Challenge',
    );
    return player;
  }

  async getActiveRequest(userId: string): Promise<QueuedPlayer | null> {
    const raw = await this.redis.get(redisKeys.matchmakingUser(userId));
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as QueuedPlayer;
      if (this.now() - parsed.queuedAt > MATCHMAKING_STALE_SECONDS * 1000) {
        await this.remove(userId, parsed.domainSlug);
        return null;
      }
      return parsed;
    } catch {
      await this.redis.del(redisKeys.matchmakingUser(userId));
      return null;
    }
  }

  async remove(userId: string, domainSlug?: string): Promise<void> {
    const raw = await this.redis.get(redisKeys.matchmakingUser(userId));
    await this.redis.del(redisKeys.matchmakingUser(userId));
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as QueuedPlayer;
      const domain = domainSlug ?? parsed.domainSlug;
      await this.redis.getClient().hdel(redisKeys.matchmakingQueue(domain), parsed.requestId);
    } catch {
      this.logger.warn(`matchmaking.remove malformed entry userId=${userId}`, 'Challenge');
    }
  }

  /**
   * Attempts to find and atomically claim an opponent. Returns null when no
   * compatible player is queued (or another consumer holds the domain lock).
   */
  async tryMatch(player: QueuedPlayer): Promise<MatchPair | null> {
    await this.redis.requireReady();
    return this.lock.withLock(`matchmaking:${player.domainSlug}`, MATCH_LOCK_TTL_MS, async () => {
      const client = this.redis.getClient();
      const entries = await client.hgetall(redisKeys.matchmakingQueue(player.domainSlug));
      const now = this.now();
      const waitedSeconds = Math.max(0, (now - player.queuedAt) / 1000);
      const window = player.rating === 0 ? Number.MAX_SAFE_INTEGER : 150 + waitedSeconds * 4;

      let best: QueuedPlayer | null = null;
      for (const raw of Object.values(entries)) {
        let candidate: QueuedPlayer;
        try {
          candidate = JSON.parse(raw) as QueuedPlayer;
        } catch {
          continue;
        }
        if (candidate.userId === player.userId) {
          continue;
        }
        if (now - candidate.queuedAt > MATCHMAKING_STALE_SECONDS * 1000) {
          await client.hdel(redisKeys.matchmakingQueue(player.domainSlug), candidate.requestId);
          continue;
        }
        if (Math.abs(candidate.rating - player.rating) > Math.min(window, 600)) {
          continue;
        }
        if (
          !best ||
          Math.abs(candidate.rating - player.rating) < Math.abs(best.rating - player.rating)
        ) {
          best = candidate;
        }
      }

      if (!best) {
        return null;
      }

      const claimed = await client.eval(
        CLAIM_SCRIPT,
        1,
        redisKeys.matchmakingQueue(player.domainSlug),
        player.requestId,
        best.requestId,
      );
      if (Number(claimed) !== 1) {
        return null;
      }
      await this.redis.del([
        redisKeys.matchmakingUser(best.userId),
        redisKeys.matchmakingUser(player.userId),
      ]);
      this.logger.log(
        `challenge.matchmaking.matched domain=${player.domainSlug} p1=${player.userId} p2=${best.userId}`,
        'Challenge',
      );
      return { requestId: player.requestId, player1: player, player2: best };
    });
  }

  /** Prunes stale queue members and orphaned user pointers. Idempotent. */
  async sweepStale(): Promise<number> {
    await this.redis.requireReady();
    const now = this.now();
    let removed = 0;
    const client = this.redis.getClient();
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      select: { slug: true },
    });
    for (const { slug } of categories) {
      const queueKey = redisKeys.matchmakingQueue(slug);
      const entries = await client.hgetall(queueKey);
      for (const [field, raw] of Object.entries(entries)) {
        if (this.isStale(raw, now)) {
          await client.hdel(queueKey, field);
          removed += 1;
        }
      }
    }
    const userKeys = await this.redis.scanKeys(redisKeys.matchmakingUserPattern());
    for (const key of userKeys) {
      const raw = await this.redis.get(key);
      if (!raw) {
        continue;
      }
      if (this.isStale(raw, now)) {
        await this.redis.del(key);
        removed += 1;
      }
    }
    if (removed > 0) {
      this.logger.log(`challenge.matchmaking.sweep removed=${removed}`, 'Challenge');
    }
    return removed;
  }

  private isStale(raw: string, now: number): boolean {
    try {
      const parsed = JSON.parse(raw) as QueuedPlayer;
      return now - parsed.queuedAt > MATCHMAKING_STALE_SECONDS * 1000;
    } catch {
      return true;
    }
  }

  private async getRating(userId: string, domainSlug: string): Promise<number> {
    const rating = await this.prisma.challengeRating.findUnique({
      where: { userId_domainSlug: { userId, domainSlug } },
      select: { rating: true },
    });
    return rating?.rating ?? 1000;
  }
}
