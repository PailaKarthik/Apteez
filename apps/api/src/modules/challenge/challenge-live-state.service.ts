import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../common/logger/app-logger';
import { redisKeys } from '../../redis/redis-keys';
import { RedisService } from '../../redis/redis.service';

export interface ChallengeLiveState {
  challengeId: string;
  status: string;
  player1Id: string;
  player2Id: string;
  questionCount: number;
  startedAt: string | null;
  endsAt: string | null;
  updatedAt: string;
}

/**
 * Ephemeral live-challenge state in Redis. It exists only to make real-time
 * reads cheap (who is in this challenge, which socket is connected, which
 * positions are answered) — PostgreSQL stays the authoritative record for the
 * finalized challenge, so losing this state never changes a result.
 *
 * Every method degrades safely: a Redis hiccup is logged and treated as
 * "unknown" (callers fall back to the database) rather than crashing a live
 * request.
 */
@Injectable()
export class ChallengeLiveStateService {
  constructor(
    private readonly redis: RedisService,
    private readonly logger: AppLogger,
  ) {}

  async writeLiveState(state: ChallengeLiveState, retentionSeconds: number): Promise<void> {
    try {
      await this.redis.set(
        redisKeys.challengeLive(state.challengeId),
        JSON.stringify(state),
        retentionSeconds,
      );
    } catch (error) {
      this.warn(`writeLiveState id=${state.challengeId}`, error);
    }
  }

  async readLiveState(challengeId: string): Promise<ChallengeLiveState | null> {
    try {
      const raw = await this.redis.get(redisKeys.challengeLive(challengeId));
      if (!raw) {
        return null;
      }
      return JSON.parse(raw) as ChallengeLiveState;
    } catch (error) {
      this.warn(`readLiveState id=${challengeId}`, error);
      return null;
    }
  }

  async clearLiveState(challengeId: string): Promise<void> {
    try {
      await this.redis.del(redisKeys.challengeLive(challengeId));
    } catch (error) {
      this.warn(`clearLiveState id=${challengeId}`, error);
    }
  }

  async markConnected(
    challengeId: string,
    userId: string,
    socketId: string,
    retentionSeconds: number,
  ): Promise<void> {
    try {
      await this.redis.set(
        redisKeys.challengeConn(challengeId, userId),
        socketId,
        retentionSeconds,
      );
      await this.redis.del(redisKeys.challengeDisc(challengeId, userId));
    } catch (error) {
      this.warn(`markConnected id=${challengeId} user=${userId}`, error);
    }
  }

  async markDisconnected(
    challengeId: string,
    userId: string,
    retentionSeconds: number,
  ): Promise<void> {
    try {
      await this.redis.del(redisKeys.challengeConn(challengeId, userId));
      await this.redis.set(
        redisKeys.challengeDisc(challengeId, userId),
        String(Date.now()),
        retentionSeconds,
      );
    } catch (error) {
      this.warn(`markDisconnected id=${challengeId} user=${userId}`, error);
    }
  }

  /** The socket id currently bound to this player in this challenge, if any. */
  async getActiveSocket(challengeId: string, userId: string): Promise<string | null> {
    try {
      return await this.redis.get(redisKeys.challengeConn(challengeId, userId));
    } catch (error) {
      this.warn(`getActiveSocket id=${challengeId} user=${userId}`, error);
      return null;
    }
  }

  async isConnected(challengeId: string, userId: string): Promise<boolean> {
    return (await this.getActiveSocket(challengeId, userId)) !== null;
  }

  async getDisconnectedAt(challengeId: string, userId: string): Promise<number | null> {
    try {
      const raw = await this.redis.get(redisKeys.challengeDisc(challengeId, userId));
      if (!raw) {
        return null;
      }
      const parsed = Number.parseInt(raw, 10);
      return Number.isFinite(parsed) ? parsed : null;
    } catch (error) {
      this.warn(`getDisconnectedAt id=${challengeId} user=${userId}`, error);
      return null;
    }
  }

  async setActiveUser(
    userId: string,
    challengeId: string,
    retentionSeconds: number,
  ): Promise<void> {
    try {
      await this.redis.set(redisKeys.challengeActiveUser(userId), challengeId, retentionSeconds);
    } catch (error) {
      this.warn(`setActiveUser user=${userId}`, error);
    }
  }

  async getActiveUserChallenge(userId: string): Promise<string | null> {
    try {
      return await this.redis.get(redisKeys.challengeActiveUser(userId));
    } catch (error) {
      this.warn(`getActiveUserChallenge user=${userId}`, error);
      return null;
    }
  }

  async clearActiveUser(userId: string): Promise<void> {
    try {
      await this.redis.del(redisKeys.challengeActiveUser(userId));
    } catch (error) {
      this.warn(`clearActiveUser user=${userId}`, error);
    }
  }

  async markAnswered(
    challengeId: string,
    userId: string,
    position: number,
    retentionSeconds: number,
  ): Promise<void> {
    try {
      await this.redis.sadd(
        redisKeys.challengeAnswered(challengeId, userId),
        String(position),
        retentionSeconds,
      );
    } catch (error) {
      this.warn(`markAnswered id=${challengeId} user=${userId}`, error);
    }
  }

  async hasAnswered(challengeId: string, userId: string, position: number): Promise<boolean> {
    try {
      return await this.redis.sismember(
        redisKeys.challengeAnswered(challengeId, userId),
        String(position),
      );
    } catch (error) {
      this.warn(`hasAnswered id=${challengeId} user=${userId}`, error);
      return false;
    }
  }

  async clearAnswered(challengeId: string, userId: string): Promise<void> {
    try {
      await this.redis.del(redisKeys.challengeAnswered(challengeId, userId));
    } catch (error) {
      this.warn(`clearAnswered id=${challengeId} user=${userId}`, error);
    }
  }

  /**
   * Removes every ephemeral key belonging to a challenge. Called after
   * finalization and by the cleanup sweep; safe to run repeatedly and never
   * touches PostgreSQL. Failure here must not alter a persisted result.
   */
  async clearChallengeState(challengeId: string): Promise<void> {
    try {
      await this.redis.del(redisKeys.challengeLive(challengeId));
      const connKeys = await this.redis.scanKeys(
        `${redisKeys.challengeLive(challengeId).replace(/:live$/, '')}:conn:*`,
      );
      const discKeys = await this.redis.scanKeys(
        `${redisKeys.challengeLive(challengeId).replace(/:live$/, '')}:disc:*`,
      );
      const answeredKeys = await this.redis.scanKeys(
        `${redisKeys.challengeLive(challengeId).replace(/:live$/, '')}:answered:*`,
      );
      await this.redis.del([...connKeys, ...discKeys, ...answeredKeys]);
    } catch (error) {
      this.warn(`clearChallengeState id=${challengeId}`, error);
    }
  }

  /**
   * Sweeps live-state keys left behind by finished challenges (a crash between
   * finalize and cleanup, or a TTL that outlived the challenge). Idempotent:
   * clearing an already-missing key is a no-op.
   */
  async sweepExpired(): Promise<number> {
    try {
      const keys = await this.redis.scanKeys(redisKeys.challengeLivePattern());
      let cleared = 0;
      for (const key of keys) {
        const raw = await this.redis.get(key);
        if (!raw) {
          continue;
        }
        let parsed: ChallengeLiveState;
        try {
          parsed = JSON.parse(raw) as ChallengeLiveState;
        } catch {
          await this.redis.del(key);
          cleared += 1;
          continue;
        }
        if (['COMPLETED', 'CANCELLED', 'ABANDONED', 'EXPIRED'].includes(parsed.status)) {
          await this.clearChallengeState(parsed.challengeId);
          await this.clearActiveUser(parsed.player1Id);
          await this.clearActiveUser(parsed.player2Id);
          cleared += 1;
        }
      }
      return cleared;
    } catch (error) {
      this.warn('sweepExpired', error);
      return 0;
    }
  }

  private warn(context: string, error: unknown): void {
    this.logger.warn(
      `redis.live.${context} ${error instanceof Error ? error.message : String(error)}`,
      'Challenge',
    );
  }
}
