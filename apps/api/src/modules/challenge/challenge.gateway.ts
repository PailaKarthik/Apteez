import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
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
import { SessionService } from '../auth/session.service';
import { ChallengeService } from './challenge.service';
import { ChallengeRealtime } from './challenge.realtime';
import { ChallengeCoordinator } from './challenge.coordinator';
import { ChallengeStateError, QuestionNotActiveError, ReadingTimeError } from './challenge.errors';
import { challengeAnswerSchema, startMatchmakingSchema } from '@apteez/validation';
import type { ChallengeSocketError } from '@apteez/types';

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
 * No competitive decision is made here.
 */
@WebSocketGateway({
  namespace: '/challenge',
  cors: { credentials: true },
})
export class ChallengeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly sessions: SessionService,
    private readonly config: ConfigService<Env, true>,
    private readonly challenges: ChallengeService,
    private readonly realtime: ChallengeRealtime,
    private readonly coordinator: ChallengeCoordinator,
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
    const userId = await this.resolveUser(client);
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
    payload: unknown,
  ): Promise<{ ok: boolean }> {
    const userId = client.data.userId;
    if (!userId) {
      this.fail(client, 'AUTH_REQUIRED', 'Sign in to play.');
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
    const userId = client.data.userId;
    if (!userId) {
      return { ok: false };
    }
    await this.coordinator.cancelMatchmaking(userId);
    return { ok: true };
  }

  @SubscribeMessage('challenge:subscribe')
  async onSubscribe(
    @ConnectedSocket() client: AuthedSocket,
    payload: { challengeId?: unknown },
  ): Promise<{ ok: boolean }> {
    const userId = client.data.userId;
    const challengeId = typeof payload?.challengeId === 'string' ? payload.challengeId : undefined;
    if (!userId || !challengeId) {
      this.fail(client, 'VALIDATION_ERROR', 'A challenge id is required.');
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
    payload: unknown,
  ): Promise<{ ok: boolean }> {
    const userId = client.data.userId;
    if (!userId) {
      this.fail(client, 'AUTH_REQUIRED', 'Sign in to submit answers.');
      return { ok: false };
    }
    const parsed = challengeAnswerSchema.safeParse(payload);
    if (!parsed.success) {
      this.fail(client, 'VALIDATION_ERROR', 'Invalid answer payload.');
      return { ok: false };
    }
    try {
      const ack = await this.challenges.submitAnswer(userId, parsed.data);
      client.emit('challenge:answer:ack', ack);
      const challenge = await this.challenges.loadChallenge(parsed.data.challengeId);
      await this.coordinator.pushOpponentProgress(challenge.id, userId);
      if (challenge.status === 'COMPLETED' || challenge.status === 'ABANDONED') {
        await this.coordinator.pushState(challenge.id);
      } else {
        const state = await this.challenges.buildState(challenge, userId);
        client.emit('challenge:state', state);
      }
      return { ok: true };
    } catch (error) {
      this.failFromError(client, error);
      return { ok: false };
    }
  }

  @SubscribeMessage('challenge:leave')
  async onLeave(@ConnectedSocket() client: AuthedSocket): Promise<{ ok: boolean }> {
    const { userId, challengeId } = client.data;
    if (!userId || !challengeId) {
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

  private fail(client: AuthedSocket, code: string, message: string): void {
    client.emit('challenge:error', { code, message } satisfies ChallengeSocketError);
  }

  private failFromError(client: AuthedSocket, error: unknown): void {
    if (
      error instanceof ChallengeStateError ||
      error instanceof QuestionNotActiveError ||
      error instanceof ReadingTimeError
    ) {
      this.fail(client, error.code, error.message);
      return;
    }
    if (error instanceof Error && 'code' in error && 'message' in error) {
      const coded = error as { code: unknown; message: string };
      if (typeof coded.code === 'string') {
        this.fail(client, coded.code, coded.message);
        return;
      }
    }
    this.logger.error(
      `challenge.socket.error ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error.stack : undefined,
      'Challenge',
    );
    this.fail(client, 'INTERNAL_ERROR', 'Something went wrong.');
  }
}
