import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { ChallengeStatus } from '@apteez/types';

export interface ChallengeBroadcast {
  challengeId: string;
  player1Id: string;
  player2Id: string;
  status: ChallengeStatus;
}

/**
 * Process-local event bus decoupling the challenge service (state machine)
 * from the socket gateway (transport). Keeps the service testable without a
 * socket server and avoids a circular dependency between the two.
 *
 * NOTE: events are process-local. Horizontal scaling would replace this with
 * Redis pub/sub in a later prompt; the boundary already isolates it.
 */
@Injectable()
export class ChallengeEvents {
  private readonly emitter = new EventEmitter();

  emitChallengeUpdated(event: ChallengeBroadcast): void {
    this.emitter.emit('challenge.updated', event);
  }

  onChallengeUpdated(listener: (event: ChallengeBroadcast) => void): () => void {
    this.emitter.on('challenge.updated', listener);
    return () => this.emitter.off('challenge.updated', listener);
  }
}
