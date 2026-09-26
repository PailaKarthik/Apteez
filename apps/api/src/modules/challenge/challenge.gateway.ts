import { type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { Env } from '../../config/env';
import { AppLogger } from '../../common/logger/app-logger';
import { AppError } from '../../common/errors/app-error';
import { RedisService } from '../../redis/redis.service';
import { redisKeys } from '../../redis/redis-keys';
import { SessionService } from '../auth/session.service';
import { ChallengeService } from './challenge.service';
import { ChallengeRealtime } from './challenge.realtime';
import { ChallengeCoordinator } from './challenge.coordinator';
import {
  challengeAnswerSchema,
  challengeSubscribeSchema,
  startMatchmakingSchema,
} from '@apteez/validation';
import type {
  ChallengeAnswerAckDto,
  ChallengeOpponentProgressDto,
  ChallengeSocketError,
} from '@apteez/types';

interface AuthedSocket extends Socket {
  data: {
    userId?: string;
    challengeId?: string;
  };
}

/**
 * Live challenge transport. The socket is a thin shell over the authoritative
 * ChallengeService/Coordinator — it authenticates the handshake, joins the
 * challenge room, forwards answer submissions and pushes per-player state.
 * No competitive decision is made here. Flood protection is a best-effort
 * per-user counter (fail-open when Redis is down, matching the HTTP
 * throttler); the service layer remains the real backstop.
 */
const WS_EVENT_LIMIT = 60;
const WS_EVENT_WINDOW_SECONDS = 60;
@WebSocketGateway({
  namespace: '/challenge',
  cors: { credentials: true },
})
export class ChallengeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly sessions: SessionService,
    private readonly config: ConfigService<Env, true>,
    private readonly challenges: ChallengeService,
    private readonly realtime: ChallengeRealtime,
    private readonly coordinator: ChallengeCoordinator,
    private readonly redis: RedisService,
    private readonly logger: AppLogger,
  ) {}

  afterInit(server: Server): void {
    this.realtime.bind(
      (userId, event, payload) => {
        server.to(this.userRoom(userId)).emit(event, payload);
      },
      (room, event, payload) => {
        server.to(room).emit(event, payload);
      },
    );
  }

  async handleConnection(client: AuthedSocket): Promise<void> {
    let userId: string | null = null;
    try {
      userId = await this.resolveUser(client);
    } catch (error) {
      this.logger.warn(
        `challenge.socket.auth-failed socket=${client.id} ${error instanceof Error ? error.message : String(error)}`,
        'Challenge',
      );
    }
    if (!userId) {
      client.emit('challenge:error', {
        code: 'AUTH_REQUIRED',
        message: 'Sign in to join a challenge.',
      } satisfies ChallengeSocketError);
      client.disconnect(true);
      return;
    }
    client.data.userId = userId;
    await client.join(this.userRoom(userId));
    this.realtime.register(userId, client.id);
    this.logger.log(`challenge.socket.connect userId=${userId} socket=${client.id}`, 'Challenge');
  }

  async handleDisconnect(client: AuthedSocket): Promise<void> {
    const { userId, challengeId } = client.data;
    this.realtime.unregister(client.id);
    if (!userId) {
      return;
    }
    this.logger.log(`challenge.socket.disconnect userId=${userId}`, 'Challenge');
    await this.coordinator.handleDisconnect(userId, challengeId);
  }

  @SubscribeMessage('challenge:matchmaking:start')
  async onStartMatchmaking(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: unknown,
  ): Promise<{ ok: boolean }> {
    const userId = await this.ensureUser(client);
    if (!userId) {
      this.fail(client, 'AUTH_REQUIRED', 'Sign in to play.');
      return { ok: false };
    }
    if (!(await this.checkFlood(client, userId, 'challenge:matchmaking:start'))) {
      return { ok: false };
    }
    const parsed = startMatchmakingSchema.safeParse(payload);
    if (!parsed.success) {
      this.fail(client, 'VALIDATION_ERROR', 'Pick a valid challenge domain.');
      return { ok: false };
    }
    try {
      await this.coordinator.startMatchmaking(userId, parsed.data.domainSlug);
      return { ok: true };
    } catch (error) {
      this.failFromError(client, error);
      return { ok: false };
    }
  }

  @SubscribeMessage('challenge:matchmaking:cancel')
  async onCancelMatchmaking(@ConnectedSocket() client: AuthedSocket): Promise<{ ok: boolean }> {
    const userId = await this.ensureUser(client);
    if (!userId) {
      return { ok: false };
    }
    if (!(await this.checkFlood(client, userId, 'challenge:matchmaking:cancel'))) {
      return { ok: false };
    }
    try {
      await this.coordinator.cancelMatchmaking(userId);
      return { ok: true };
    } catch (error) {
      this.failFromError(client, error);
      return { ok: false };
    }
  }

  @SubscribeMessage('challenge:subscribe')
  async onSubscribe(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: unknown,
  ): Promise<{ ok: boolean }> {
    const userId = await this.ensureUser(client);
    if (!userId) {
      this.fail(client, 'AUTH_REQUIRED', 'Sign in to join a challenge.');
      return { ok: false };
    }
    const parsed = challengeSubscribeSchema.safeParse(payload);
    if (!parsed.success) {
      this.fail(client, 'VALIDATION_ERROR', 'A challenge id is required.');
      return { ok: false };
    }
    const { challengeId } = parsed.data;
    if (!(await this.checkFlood(client, userId, 'challenge:subscribe'))) {
      return { ok: false };
    }
    try {
      const state = await this.coordinator.subscribe(userId, client.id, challengeId);
      client.data.challengeId = challengeId;
      await client.join(this.room(challengeId));
      client.emit('challenge:state', state);
      return { ok: true };
    } catch (error) {
      this.failFromError(client, error);
      return { ok: false };
    }
  }

  @SubscribeMessage('challenge:answer')
  async onAnswer(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: unknown,
  ): Promise<ChallengeAnswerAckDto | { ok: boolean }> {
    const userId = await this.ensureUser(client);
    if (!userId) {
      this.fail(client, 'AUTH_REQUIRED', 'Sign in to submit answers.');
      return { ok: false };
    }
    if (!(await this.checkFlood(client, userId, 'challenge:answer'))) {
      return { ok: false };
    }
    const parsed = challengeAnswerSchema.safeParse(payload);
    if (!parsed.success) {
      this.fail(client, 'VALIDATION_ERROR', 'Invalid answer payload.');
      return { ok: false };
    }
    try {
      // The ack is the confirmation: it carries the next question plus both
      // scores, so the UI advances instantly. The old path returned only
      // `{ ok: true }` and made the client wait for a full state rebuild
      // (several slow round trips) before showing the next question.
      const ack = await this.challenges.submitAnswer(userId, parsed.data);
      client.emit('challenge:answer:ack', ack);
      // Fan-out continues in the background: opponent progress + terminal
      // push use cheap selects only, never blocking the acknowledgment.
      void this.afterAnswer(parsed.data.challengeId, userId, ack.selfProgress);
      return ack;
    } catch (error) {
      this.failFromError(client, error);
      return { ok: false };
    }
  }

  /**
   * Post-ack fan-out (fire-and-forget). Mid-game this is just the opponent
   * progress push; on a terminal challenge the full state (with `completed`
   * events) follows. Failures only log — the answer itself is already stored.
   */
  private async afterAnswer(
    challengeId: string,
    userId: string,
    progress: ChallengeOpponentProgressDto,
  ): Promise<void> {
    try {
      await this.coordinator.pushOpponentProgress(challengeId, userId, progress);
      if (await this.challenges.isTerminalStatus(challengeId)) {
        await this.coordinator.pushState(challengeId);
      }
    } catch (error) {
      this.logger.warn(
        `challenge.answer.fanout-failed id=${challengeId} ${error instanceof Error ? error.message : String(error)}`,
        'Challenge',
      );
    }
  }

  @SubscribeMessage('challenge:leave')
  async onLeave(@ConnectedSocket() client: AuthedSocket): Promise<{ ok: boolean }> {
    const { userId, challengeId } = client.data;
    if (!userId || !challengeId) {
      return { ok: false };
    }
    if (!(await this.checkFlood(client, userId, 'challenge:leave'))) {
      return { ok: false };
    }
    try {
      await this.challenges.cancel(challengeId, userId);
      await this.coordinator.pushState(challengeId);
    } catch (error) {
      this.failFromError(client, error);
    }
    return { ok: true };
  }

  private async resolveUser(client: AuthedSocket): Promise<string | null> {
    const cookieName = this.config.get('SESSION_COOKIE_NAME', { infer: true });
    const token =
      this.readCookie(client.handshake.headers.cookie, cookieName) ??
      (typeof client.handshake.auth?.token === 'string' ? client.handshake.auth.token : undefined);
    if (!token) {
      return null;
    }
    const session = await this.sessions.resolve(token);
    return session?.userId ?? null;
  }

  /**
   * Emits can race the async handshake auth: if the socket isn't identified
   * yet, resolve from the handshake now instead of failing the action.
   */
  private async ensureUser(client: AuthedSocket): Promise<string | null> {
    if (client.data.userId) {
      return client.data.userId;
    }
    const userId = await this.resolveUser(client).catch(() => null);
    if (userId) {
      client.data.userId = userId;
      try {
        await client.join(this.userRoom(userId));
      } catch {
        // Join failure must not fail the action; realtime is best-effort.
      }
    }
    return userId;
  }

  private readCookie(header: string | undefined, name: string): string | undefined {
    if (!header) {
      return undefined;
    }
    for (const part of header.split(';')) {
      const [key, ...rest] = part.trim().split('=');
      if (key === name) {
        return decodeURIComponent(rest.join('='));
      }
    }
    return undefined;
  }

  private userRoom(userId: string): string {
    return `user:${userId}`;
  }

  private room(challengeId: string): string {
    return `challenge:${challengeId}`;
  }

  /**
   * Best-effort per-user flood guard. Fail-open when Redis is unavailable
   * (matching the HTTP throttler); the service layer still validates every
   * payload, so this only sheds obvious floods.
   */
  private async checkFlood(client: AuthedSocket, userId: string, event: string): Promise<boolean> {
    try {
      const count = await this.redis.incr(
        redisKeys.websocketRate(userId, event),
        WS_EVENT_WINDOW_SECONDS,
      );
      if (count > WS_EVENT_LIMIT) {
        this.fail(client, 'RATE_LIMITED', 'Too many requests. Slow down and try again.');
        return false;
      }
      return true;
    } catch {
      return true;
    }
  }

  /** Graceful shutdown: stop accepting live play, then disconnect sockets. */
  async onModuleDestroy(): Promise<void> {
    try {
      this.server?.emit('challenge:shutdown', {
        code: 'SERVER_SHUTDOWN',
        message: 'Server is restarting. Reconnect shortly.',
      });
      this.server?.disconnectSockets(true);
      this.server?.close();
    } catch (error) {
      this.logger.warn(
        `challenge.socket.shutdown-failed ${error instanceof Error ? error.message : String(error)}`,
        'Challenge',
      );
    }
  }

  private fail(client: AuthedSocket, code: string, message: string): void {
    client.emit('challenge:error', { code, message } satisfies ChallengeSocketError);
  }

  private failFromError(client: AuthedSocket, error: unknown): void {
    // Only AppError subclasses carry client-safe codes/messages by
    // construction. Anything else is logged with its stack and replaced —
    // never forward arbitrary `.code`/`.message` properties to clients.
    if (error instanceof AppError) {
      this.fail(client, error.code, error.message);
      return;
    }
    this.logger.error(
      `challenge.socket.error ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error.stack : undefined,
      'Challenge',
    );
    this.fail(client, 'INTERNAL_ERROR', 'Something went wrong.');
  }
}
