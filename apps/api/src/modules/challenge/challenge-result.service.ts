import { Injectable } from '@nestjs/common';
import type { ChallengeOutcome } from '@apteez/types';
import { buildScoreboard, computeScore } from './challenge.util';

export interface PlayerResultInput {
  id: string;
  username: string | null;
  displayName: string;
  avatarKey: string | null;
  rating: number;
  correct: number;
  wrong: number;
}

export interface ResolvedResult {
  outcome: ChallengeOutcome;
  winnerId: string | null;
  player1Score: number;
  player2Score: number;
  player1Scoreboard: ReturnType<typeof buildScoreboard>;
  player2Scoreboard: ReturnType<typeof buildScoreboard>;
}

/**
 * Winner determination, isolated on purpose so Prompt 10 (rating) and any
 * future tie-rule change touch exactly this file.
 *
 * Rules:
 *  1. Higher final score (correct ��� wrong) wins.
 *  2. Tie on score -> higher correct count wins.
 *  3. Still tied -> DRAW.
 * Rating is never used to pick a winner.
 */
@Injectable()
export class ChallengeResultService {
  resolve(
    player1: PlayerResultInput,
    player2: PlayerResultInput,
    questionCount: number,
  ): ResolvedResult {
    const p1 = buildScoreboard(player1.correct, player1.wrong, questionCount);
    const p2 = buildScoreboard(player2.correct, player2.wrong, questionCount);
    const player1Score = computeScore(player1.correct, player1.wrong);
    const player2Score = computeScore(player2.correct, player2.wrong);

    let outcome: ChallengeOutcome;
    let winnerId: string | null;

    if (player1Score > player2Score) {
      outcome = 'PLAYER1_WIN';
      winnerId = player1.id;
    } else if (player2Score > player1Score) {
      outcome = 'PLAYER2_WIN';
      winnerId = player2.id;
    } else if (player1.correct > player2.correct) {
      outcome = 'PLAYER1_WIN';
      winnerId = player1.id;
    } else if (player2.correct > player1.correct) {
      outcome = 'PLAYER2_WIN';
      winnerId = player2.id;
    } else {
      outcome = 'DRAW';
      winnerId = null;
    }

    return {
      outcome,
      winnerId,
      player1Score,
      player2Score,
      player1Scoreboard: p1,
      player2Scoreboard: p2,
    };
  }

  abandon(player1Id: string, player2Id: string, abandonerId: string): ResolvedResult {
    // The player who stayed is awarded the win by abandonment.
    const winnerId = abandonerId === player1Id ? player2Id : player1Id;
    return {
      outcome: abandonerId === player1Id ? 'PLAYER2_WIN' : 'PLAYER1_WIN',
      winnerId,
      player1Score: 0,
      player2Score: 0,
      player1Scoreboard: buildScoreboard(0, 0, 0),
      player2Scoreboard: buildScoreboard(0, 0, 0),
    };
  }
}
