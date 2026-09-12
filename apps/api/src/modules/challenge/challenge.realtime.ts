import { Injectable } from '@nestjs/common';

/**
 * In-process socket registry for the challenge namespace. Maps users to their
 * live connections and sockets to the challenge they are viewing, so both the
 * gateway and the matchmaking coordinator can push updates without knowing
 * about each other.
 *
 * Process-local by design for now; a Redis pub/sub fan-out would slot in here
 * when the API scales horizontally.
 */
@Injectable()
export class ChallengeRealtime {
  private readonly userSockets = new Map<string, Set<string>>();
  private readonly socketChallenge = new Map<string, string>();
  private emitter: ((userId: string, event: string, payload: unknown) => void) | null = null;
  private roomEmitter: ((room: string, event: string, payload: unknown) => void) | null = null;

  /** Bound by the gateway once the Socket.IO server exists. */
  bind(
    toUser: (userId: string, event: string, payload: unknown) => void,
    toRoom: (room: string, event: string, payload: unknown) => void,
  ): void {
    this.emitter = toUser;
    this.roomEmitter = toRoom;
  }

  register(userId: string, socketId: string): void {
    const set = this.userSockets.get(userId) ?? new Set<string>();
    set.add(socketId);
    this.userSockets.set(userId, set);
  }

  unregister(socketId: string): void {
    for (const [userId, sockets] of this.userSockets.entries()) {
      if (sockets.delete(socketId) && sockets.size === 0) {
        this.userSockets.delete(userId);
      }
    }
    this.socketChallenge.delete(socketId);
  }

  setChallenge(socketId: string, challengeId: string): void {
    this.socketChallenge.set(socketId, challengeId);
  }

  getChallengeForSocket(socketId: string): string | undefined {
    return this.socketChallenge.get(socketId);
  }

  isUserOnline(userId: string): boolean {
    return (this.userSockets.get(userId)?.size ?? 0) > 0;
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.emitter?.(userId, event, payload);
  }

  emitToRoom(room: string, event: string, payload: unknown): void {
    this.roomEmitter?.(room, event, payload);
  }
}
