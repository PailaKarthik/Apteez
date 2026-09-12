import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { CHALLENGE_SOCKET_EVENTS } from '@apteez/types';
import type { ChallengePlayerPresenceDto, ChallengeStateDto } from '@apteez/types';
import { AppLogger } from '../../common/logger/app-logger';
import { ChallengeService } from './challenge.service';
import { ChallengeRealtime } from './challenge.realtime';
import { MatchmakingService, type QueuedPlayer } from './matchmaking.service';
import { CHALLENGE_RECONNECT_GRACE_SECONDS } from './challenge.config';
import { isTerminal } from './challenge.util';

/**
 * Orchestrates ephemeral matchmaking/live coordination on top of the
 * authoritative ChallengeService: it owns the search loops, the per-challenge
 * tick that drives countdown/expiry from server time, and the disconnect grace
 * timers. All state it holds is a cache of Redis/PostgreSQL truth.
 */
@Injectable()
export class ChallengeCoordinator implements OnModuleDestroy {
  private readonly searchTimers = new Map<string, NodeJS.Timeout>();
  private readonly challengeTimers = new Map<string, NodeJS.Timeout>();
  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly matchmaking: MatchmakingService,
    private readonly challenges: ChallengeService,
    private readonly realtime: ChallengeRealtime,
    private readonly logger: AppLogger,
  ) {}

  onModuleDestroy(): void {
    for (const timer of this.searchTimers.values()) {
      clearInterval(timer);
    }
    for (const timer of this.challengeTimers.values()) {
      clearInterval(timer);
    }
    for (const timer of this.disconnectTimers.values()) {
      clearTimeout(timer);
    }
  }

  async startMatchmaking(userId: string, domainSlug: string): Promise<QueuedPlayer> {
    const player = await this.matchmaking.enqueue(userId, domainSlug);
    this.realtime.emitToUser(userId, 'challenge:matchmaking:status', {
      status: 'SEARCHING',
      requestId: player.requestId,
      domainSlug: player.domainSlug,
      rating: player.rating,
      queuedAt: new Date(player.queuedAt).toISOString(),
    });
    this.ensureSearchLoop(player.userId);
    return player;
  }

  async cancelMatchmaking(userId: string): Promise<void> {
    this.clearSearchLoop(userId);
    await this.matchmaking.remove(userId);
    this.realtime.emitToUser(userId, 'challenge:matchmaking:status', { status: 'CANCELLED' });
  }

  /** Subscribes a socket to a challenge it already belongs to. */
  async subscribe(
    userId: string,
    socketId: string,
    challengeId: string,
  ): Promise<ChallengeStateDto> {
    const challenge = await this.challenges.loadChallenge(challengeId);
    this.challenges.assertMember(challenge, userId);
    this.realtime.setChallenge(socketId, challengeId);
    const graceKey = `${challengeId}:${userId}`;
    const pending = this.disconnectTimers.get(graceKey);
    if (pending) {
      clearTimeout(pending);
      this.disconnectTimers.delete(graceKey);
    }
    await this.challenges.setConnected(challengeId, userId, true, socketId);
    this.ensureChallengeTick(challengeId);
    const opponentId = this.opponentOf(challenge, userId);
    this.realtime.emitToUser(opponentId, CHALLENGE_SOCKET_EVENTS.playerConnected, {
      challengeId,
      userId,
      connected: true,
    } satisfies ChallengePlayerPresenceDto);
    await this.pushState(challengeId);
    return this.challenges.buildState(challenge, userId);
  }

  /** Lightweight opponent-progress push, safe to send mid-question. */
  async pushOpponentProgress(challengeId: string, playerId: string): Promise<void> {
    const challenge = await this.challenges.loadChallenge(challengeId);
    const opponentId = this.opponentOf(challenge, playerId);
    this.realtime.emitToUser(
      opponentId,
      CHALLENGE_SOCKET_EVENTS.opponentProgress,
      this.challenges.opponentProgressFor(challenge, playerId),
    );
  }

  private opponentOf(challenge: { player1Id: string; player2Id: string }, userId: string): string {
    return challenge.player1Id === userId ? challenge.player2Id : challenge.player1Id;
  }

  private ensureSearchLoop(userId: string): void {
    if (this.searchTimers.has(userId)) {
      return;
    }
    const timer = setInterval(() => {
      void this.runSearch(userId);
    }, 1000);
    this.searchTimers.set(userId, timer);
  }

  private clearSearchLoop(userId: string): void {
    const timer = this.searchTimers.get(userId);
    if (timer) {
      clearInterval(timer);
      this.searchTimers.delete(userId);
    }
  }

  private async runSearch(userId: string): Promise<void> {
    try {
      const active = await this.matchmaking.getActiveRequest(userId);
      if (!active) {
        this.clearSearchLoop(userId);
        return;
      }
      const pair = await this.matchmaking.tryMatch(active);
      if (!pair) {
        return;
      }
      this.clearSearchLoop(pair.player1.userId);
      this.clearSearchLoop(pair.player2.userId);
      const challenge = await this.challenges.createFromMatch(pair);
      await this.pushState(challenge.id);
      this.ensureChallengeTick(challenge.id);
    } catch (error) {
      this.logger.error(
        `challenge.matchmaking.error userId=${userId} ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
        'Challenge',
      );
    }
  }

  ensureChallengeTick(challengeId: string): void {
    if (this.challengeTimers.has(challengeId)) {
      return;
    }
    const timer = setInterval(() => {
      void this.runTick(challengeId);
    }, 1000);
    this.challengeTimers.set(challengeId, timer);
  }

  private clearChallengeTick(challengeId: string): void {
    const timer = this.challengeTimers.get(challengeId);
    if (timer) {
      clearInterval(timer);
      this.challengeTimers.delete(challengeId);
    }
  }

  private async runTick(challengeId: string): Promise<void> {
    try {
      const challenge = await this.challenges.syncStatus(
        await this.challenges.loadChallenge(challengeId),
      );
      if (isTerminal(challenge.status)) {
        this.clearChallengeTick(challengeId);
      }
      await this.pushState(challengeId);
    } catch (error) {
      this.logger.warn(
        `challenge.tick.error id=${challengeId} ${error instanceof Error ? error.message : String(error)}`,
        'Challenge',
      );
      this.clearChallengeTick(challengeId);
    }
  }

  /** Pushes a per-player state view; each player only sees their own view. */
  async pushState(challengeId: string): Promise<void> {
    const challenge = await this.challenges.loadChallenge(challengeId);
    const states = await Promise.all([
      this.challenges.buildState(challenge, challenge.player1Id),
      this.challenges.buildState(challenge, challenge.player2Id),
    ]);
    this.realtime.emitToUser(challenge.player1Id, 'challenge:state', states[0]);
    this.realtime.emitToUser(challenge.player2Id, 'challenge:state', states[1]);
    if (isTerminal(challenge.status)) {
      this.realtime.emitToUser(challenge.player1Id, 'challenge:completed', {
        challengeId,
      });
      this.realtime.emitToUser(challenge.player2Id, 'challenge:completed', {
        challengeId,
      });
    }
  }

  /** Starts the grace timer for a disconnected player in a live challenge. */
  scheduleDisconnectGrace(challengeId: string, userId: string): void {
    const graceKey = `${challengeId}:${userId}`;
    if (this.disconnectTimers.has(graceKey)) {
      return;
    }
    const timer = setTimeout(() => {
      void this.handleGraceExpiry(challengeId, userId);
    }, CHALLENGE_RECONNECT_GRACE_SECONDS * 1000);
    this.disconnectTimers.set(graceKey, timer);
  }

  private async handleGraceExpiry(challengeId: string, userId: string): Promise<void> {
    this.disconnectTimers.delete(`${challengeId}:${userId}`);
    try {
      if (this.realtime.isUserOnline(userId)) {
        return;
      }
      const challenge = await this.challenges.loadChallenge(challengeId);
      if (isTerminal(challenge.status)) {
        return;
      }
      await this.challenges.markDisconnectedTimeout(challengeId, userId);
      await this.pushState(challengeId);
    } catch (error) {
      this.logger.warn(
        `challenge.grace.error id=${challengeId} user=${userId} ${error instanceof Error ? error.message : String(error)}`,
        'Challenge',
      );
    }
  }

  async handleDisconnect(userId: string, challengeId?: string): Promise<void> {
    if (!challengeId) {
      await this.cancelMatchmaking(userId);
      return;
    }
    await this.challenges.setConnected(challengeId, userId, false);
    const challenge = await this.challenges.loadChallenge(challengeId);
    this.realtime.emitToUser(
      this.opponentOf(challenge, userId),
      CHALLENGE_SOCKET_EVENTS.playerDisconnected,
      {
        challengeId,
        userId,
        connected: false,
        graceSecondsRemaining: CHALLENGE_RECONNECT_GRACE_SECONDS,
      } satisfies ChallengePlayerPresenceDto,
    );
    this.scheduleDisconnectGrace(challengeId, userId);
    await this.pushState(challengeId);
  }
}
