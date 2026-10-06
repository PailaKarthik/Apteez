import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CHALLENGE_SOCKET_EVENTS } from '@apteez/types';
import type {
  ChallengeMatchedPayload,
  ChallengeOpponentProgressDto,
  ChallengePlayerPresenceDto,
  ChallengeStateDto,
} from '@apteez/types';
import { AppLogger } from '../../common/logger/app-logger';
import type { Env } from '../../config/env';
import { ChallengeService } from './challenge.service';
import { ChallengeRealtime } from './challenge.realtime';
import { MatchmakingService, type QueuedPlayer } from './matchmaking.service';
import { ChallengeQueueService } from '../../queue/challenge-queue.service';
import {
  CHALLENGE_RECONNECT_GRACE_SECONDS,
  CHALLENGE_SWEEP_INTERVAL_SECONDS,
} from './challenge.config';
import { isTerminal } from './challenge.util';

/**
 * Orchestrates ephemeral matchmaking/live coordination on top of the
 * authoritative ChallengeService: it owns the search loops, the per-challenge
 * tick that drives countdown/expiry from server time, and the disconnect grace
 * timers. All state it holds is a cache of Redis/PostgreSQL truth.
 */
@Injectable()
export class ChallengeCoordinator implements OnModuleDestroy, OnModuleInit {
  private readonly searchTimers = new Map<string, NodeJS.Timeout>();
  private readonly challengeTimers = new Map<string, NodeJS.Timeout>();
  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly matchmaking: MatchmakingService,
    private readonly challenges: ChallengeService,
    private readonly realtime: ChallengeRealtime,
    private readonly queue: ChallengeQueueService,
    private readonly config: ConfigService<Env, true>,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Crash recovery + background wiring. Repeatable sweep jobs are idempotent
   * (deterministic ids), and per-challenge activate/expire jobs are claimed
   * atomically — so a restart never loses a countdown, a timer end, or a
   * stale-queue cleanup.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.queue.scheduleMatchmakingSweep(CHALLENGE_SWEEP_INTERVAL_SECONDS * 1000);
      await this.queue.scheduleLiveStateCleanup(CHALLENGE_SWEEP_INTERVAL_SECONDS * 1000);
    } catch (error) {
      this.logger.warn(
        `challenge.sweeps.unscheduled ${error instanceof Error ? error.message : String(error)}`,
        'Challenge',
      );
    }
    try {
      const orphaned = await this.challenges.nonTerminalChallenges();
      for (const row of orphaned) {
        await this.queue.scheduleActivation(row.id, row.startedAt ?? new Date());
        if (row.endsAt) {
          await this.queue.scheduleExpiry(row.id, row.endsAt);
        }
      }
      if (orphaned.length > 0) {
        this.logger.log(`challenge.recovered count=${orphaned.length}`, 'Challenge');
      }
    } catch (error) {
      this.logger.warn(
        `challenge.recovery-failed ${error instanceof Error ? error.message : String(error)}`,
        'Challenge',
      );
    }
  }

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

  /**
   * Lightweight opponent-progress push, safe to send mid-question. When the
   * caller already computed the progress (answer ack), only the opponent id
   * is resolved (one cheap select) instead of reloading the whole challenge.
   */
  async pushOpponentProgress(
    challengeId: string,
    playerId: string,
    progress?: ChallengeOpponentProgressDto,
  ): Promise<void> {
    if (progress) {
      const opponentId = await this.challenges.opponentIdOf(challengeId, playerId);
      if (!opponentId) {
        return;
      }
      this.realtime.emitToUser(opponentId, CHALLENGE_SOCKET_EVENTS.opponentProgress, progress);
      return;
    }
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
      if (pair) {
        this.clearSearchLoop(pair.player1.userId);
        this.clearSearchLoop(pair.player2.userId);
        const challenge = await this.challenges.createFromMatch(pair);
        await this.afterMatchCreated(challenge.id);
        return;
      }
      // Nobody to pair with: after the configured wait, start an unrated
      // solo run so the player always gets a game.
      const waitedMs = Date.now() - active.queuedAt;
      const soloWaitMs = this.config.get('CHALLENGE_SOLO_WAIT_SECONDS', { infer: true }) * 1000;
      if (waitedMs >= soloWaitMs) {
        const fresh = await this.matchmaking.getActiveRequest(userId);
        if (!fresh) {
          this.clearSearchLoop(userId);
          return;
        }
        this.clearSearchLoop(userId);
        await this.matchmaking.remove(userId);
        const solo = await this.challenges.createSoloChallenge(userId, active.domainSlug);
        await this.afterMatchCreated(solo.id);
      }
    } catch (error) {
      this.logger.error(
        `challenge.matchmaking.error userId=${userId} ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
        'Challenge',
      );
    }
  }

  /** Shared post-creation wiring: timers, state push, crash-safe job backstops. */
  private async afterMatchCreated(challengeId: string): Promise<void> {
    // The lightweight MATCHED preview and the full state snapshot are
    // independent reads — fire them together. Sequential awaits serialized
    // two slow-DB round trips here, which is exactly the blackout window
    // where the client sat on "GO!" with no questions.
    await Promise.all([this.pushMatched(challengeId), this.pushState(challengeId)]);
    this.ensureChallengeTick(challengeId);
    try {
      const row = await this.challenges.timingFor(challengeId);
      await this.queue.scheduleActivation(challengeId, row.startedAt ?? new Date());
      if (row.endsAt) {
        await this.queue.scheduleExpiry(challengeId, row.endsAt);
      }
    } catch (error) {
      // The in-memory tick still drives the match; jobs are only backstops.
      this.logger.warn(
        `challenge.jobs.unscheduled id=${challengeId} ${error instanceof Error ? error.message : String(error)}`,
        'Challenge',
      );
    }
  }

  ensureChallengeTick(challengeId: string): void {
    if (this.challengeTimers.has(challengeId)) {
      return;
    }
    // 2s cadence: clients interpolate display timers locally at 250ms, so the
    // server tick only needs to catch clock transitions (countdown→live,
    // timer expiry). Halves per-match DB load vs a 1s tick.
    const timer = setInterval(() => {
      void this.runTick(challengeId);
    }, 2000);
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
      // Light clock check only — NOT a full state rebuild. A full load +
      // push every tick is ~10 serialized pooler round trips; at a 1–2s
      // cadence overlapping ticks saturate the pool and every live call
      // starts timing out. Clients interpolate display timers locally, and
      // scores/progress already push event-driven on every answer — so the
      // tick only handles clock transitions, then pushes once.
      const clock = await this.challenges.clockFor(challengeId);
      if (!clock) {
        this.clearChallengeTick(challengeId);
        return;
      }
      const now = Date.now();
      if (clock.status === 'COUNTDOWN' && clock.startedAt && now >= clock.startedAt.getTime()) {
        const challenge = await this.challenges.syncStatus(
          await this.challenges.loadChallenge(challengeId),
        );
        await this.pushState(challenge.id);
        if (isTerminal(challenge.status)) {
          this.clearChallengeTick(challengeId);
        }
        return;
      }
      if (clock.status === 'LIVE' && clock.endsAt && now >= clock.endsAt.getTime()) {
        // Tell both clients immediately so they can show "checking results"
        // instead of a frozen board while finalization (slow on free tier) runs.
        await this.announceFinalizing(challengeId);
        await this.challenges.finalizeOnce(challengeId, 'TIMER_EXPIRED');
        await this.pushState(challengeId);
        this.clearChallengeTick(challengeId);
        return;
      }
      if (isTerminal(clock.status)) {
        this.clearChallengeTick(challengeId);
      }
    } catch (error) {
      this.logger.warn(
        `challenge.tick.error id=${challengeId} ${error instanceof Error ? error.message : String(error)}`,
        'Challenge',
      );
      this.clearChallengeTick(challengeId);
    }
  }

  /**
   * Instant "match found" payload per player (see matchPreview: one cheap
   * row). Best-effort: the full state push right after is authoritative.
   */
  async pushMatched(challengeId: string): Promise<void> {
    try {
      const preview = await this.challenges.matchPreview(challengeId);
      if (!preview?.countdownEndsAt) {
        return;
      }
      const payloadFor = (userId: string): ChallengeMatchedPayload => {
        const isPlayer1 = userId === preview.player1Id;
        return {
          status: 'MATCHED',
          challengeId: preview.challengeId,
          domainSlug: preview.domainSlug,
          domainName: preview.domainName,
          countdownEndsAt: preview.countdownEndsAt as string,
          serverTime: preview.serverTime,
          isSolo: preview.isSolo,
          opponent: {
            displayName: isPlayer1 ? preview.player2DisplayName : preview.player1DisplayName,
            rating: isPlayer1 ? preview.player2RatingSnapshot : preview.player1RatingSnapshot,
          },
        };
      };
      this.realtime.emitToUser(
        preview.player1Id,
        CHALLENGE_SOCKET_EVENTS.matchmakingStatus,
        payloadFor(preview.player1Id),
      );
      this.realtime.emitToUser(
        preview.player2Id,
        CHALLENGE_SOCKET_EVENTS.matchmakingStatus,
        payloadFor(preview.player2Id),
      );
    } catch (error) {
      this.logger.warn(
        `challenge.matched.error id=${challengeId} ${error instanceof Error ? error.message : String(error)}`,
        'Challenge',
      );
    }
  }

  /** Warns both players that the timer hit zero; result follows shortly. */
  async announceFinalizing(challengeId: string): Promise<void> {
    try {
      const preview = await this.challenges.matchPreview(challengeId);
      if (!preview) {
        return;
      }
      const payload = { challengeId };
      this.realtime.emitToUser(preview.player1Id, CHALLENGE_SOCKET_EVENTS.finalizing, payload);
      this.realtime.emitToUser(preview.player2Id, CHALLENGE_SOCKET_EVENTS.finalizing, payload);
    } catch (error) {
      this.logger.warn(
        `challenge.finalizing.error id=${challengeId} ${error instanceof Error ? error.message : String(error)}`,
        'Challenge',
      );
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
