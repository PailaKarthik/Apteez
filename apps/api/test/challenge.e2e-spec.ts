import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@apteez/database';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { type Env, validateEnv } from '../src/config/env';
import {
  MatchmakingService,
  type QueuedPlayer,
} from '../src/modules/challenge/matchmaking.service';
import { ChallengeService } from '../src/modules/challenge/challenge.service';
import { ChallengeResultService } from '../src/modules/challenge/challenge-result.service';

describe('Challenge (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let matchmaking: MatchmakingService;
  let challenges: ChallengeService;
  let results: ChallengeResultService;
  let memberId: string;
  let adminId: string;
  const createdChallengeIds: string[] = [];

  beforeAll(async () => {
    const realEnv = validateEnv(process.env);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: keyof Env) => (key === 'CHALLENGE_RATE_LIMIT' ? 100000 : realEnv[key]),
      } as unknown as ConfigService<Env, true>)
      .compile();
    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    matchmaking = app.get(MatchmakingService);
    challenges = app.get(ChallengeService);
    results = app.get(ChallengeResultService);

    const member = await prisma.user.findUniqueOrThrow({ where: { email: 'member@apteez.dev' } });
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@apteez.dev' } });
    memberId = member.id;
    adminId = admin.id;
    // The rating processor is live in-process; other suites/earlier tests may
    // have moved these players' ratings. Reset to a pristine default so the
    // snapshot assertions are deterministic.
    await prisma.challengeRatingHistory.deleteMany({
      where: { userId: { in: [memberId, adminId] } },
    });
    await prisma.challengeRating.deleteMany({
      where: { userId: { in: [memberId, adminId] } },
    });
  }, 60_000);

  afterAll(async () => {
    await matchmaking.remove(memberId);
    await matchmaking.remove(adminId);
    if (createdChallengeIds.length > 0) {
      await prisma.challenge.deleteMany({ where: { id: { in: createdChallengeIds } } });
    }
    await app?.close();
  });

  async function enqueueBoth(
    domain = 'quantitative',
  ): Promise<{ a: QueuedPlayer; b: QueuedPlayer }> {
    await matchmaking.remove(memberId);
    await matchmaking.remove(adminId);
    // The busy-guard rejects enqueues while a prior test's challenge is still
    // active, so retire any non-terminal challenges for these two users first.
    await prisma.challenge.updateMany({
      where: {
        OR: [
          { player1Id: memberId },
          { player2Id: memberId },
          { player1Id: adminId },
          { player2Id: adminId },
        ],
        status: { in: ['MATCHMAKING', 'MATCHED', 'COUNTDOWN', 'LIVE'] },
      },
      data: { status: 'CANCELLED', completionReason: 'CANCELLED', endedAt: new Date() },
    });
    const a = await matchmaking.enqueue(memberId, domain);
    const b = await matchmaking.enqueue(adminId, domain);
    return { a, b };
  }

  async function createChallenge(domain = 'quantitative') {
    const { a } = await enqueueBoth(domain);
    const pair = await matchmaking.tryMatch(a);
    expect(pair).not.toBeNull();
    const challenge = await challenges.createFromMatch(pair!);
    createdChallengeIds.push(challenge.id);
    return challenge;
  }

  async function goLive(challengeId: string, minReadingSeconds = 0, durationSeconds = 300) {
    const now = new Date();
    await prisma.challenge.update({
      where: { id: challengeId },
      data: {
        status: 'LIVE',
        minReadingSeconds,
        startedAt: new Date(now.getTime() - 30_000),
        endsAt: new Date(now.getTime() + durationSeconds * 1000),
      },
    });
  }

  async function optionAt(problemId: string, correct: boolean): Promise<string> {
    const option = await prisma.problemOption.findFirstOrThrow({
      where: { problemId, isCorrect: correct },
      select: { id: true },
    });
    return option.id;
  }

  async function problemIdAt(challengeId: string, position: number): Promise<string> {
    const question = await prisma.challengeQuestion.findUniqueOrThrow({
      where: { challengeId_position: { challengeId, position } },
      select: { problemId: true },
    });
    return question.problemId;
  }

  it('enqueues a player with the domain default rating and is idempotent', async () => {
    await matchmaking.remove(memberId);
    const first = await matchmaking.enqueue(memberId, 'quantitative');
    const second = await matchmaking.enqueue(memberId, 'quantitative');
    expect(first.requestId).toBe(second.requestId);
    const active = await matchmaking.getActiveRequest(memberId);
    expect(active?.domainSlug).toBe('quantitative');
    expect(active?.rating).toBe(1000);
    await matchmaking.remove(memberId);
  });

  it('never matches a player against themselves', async () => {
    await matchmaking.remove(memberId);
    const player = await matchmaking.enqueue(memberId, 'quantitative');
    const pair = await matchmaking.tryMatch(player);
    expect(pair).toBeNull();
    await matchmaking.remove(memberId);
  });

  it('cancels a queued request', async () => {
    await matchmaking.remove(memberId);
    await matchmaking.enqueue(memberId, 'quantitative');
    await matchmaking.remove(memberId);
    const active = await matchmaking.getActiveRequest(memberId);
    expect(active).toBeNull();
  });

  it('matches two queued players and creates a persistent challenge', async () => {
    const challenge = await createChallenge('quantitative');
    expect(challenge.player1Id === memberId || challenge.player2Id === memberId).toBe(true);
    expect(challenge.player1Id === adminId || challenge.player2Id === adminId).toBe(true);
    expect(challenge.questionCount).toBeGreaterThan(0);
    expect(challenge.status).toBe('COUNTDOWN');
    expect(challenge.player1RatingSnapshot).toBe(1000);
    expect(challenge.player2RatingSnapshot).toBe(1000);
  });

  it('gives both players the same server-selected question sequence', async () => {
    const challenge = await createChallenge('quantitative');
    const state1 = await challenges.getState(challenge.id, challenge.player1Id);
    const state2 = await challenges.getState(challenge.id, challenge.player2Id);
    expect(state1.question?.problemId).toBe(state2.question?.problemId);
    expect(state1.questionCount).toBe(state2.questionCount);
  });

  it('rejects an invalid challenge state transition', async () => {
    const challenge = await createChallenge('quantitative');
    await expect(challenges.transition(challenge.id, 'COMPLETED')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('scores correct answers +1 and wrong answers -1', async () => {
    const challenge = await createChallenge('quantitative');
    await goLive(challenge.id, 0);
    const problemId = await problemIdAt(challenge.id, 0);
    const correct = await optionAt(problemId, true);
    const wrong = await optionAt(problemId, false);

    await challenges.submitAnswer(memberId, {
      challengeId: challenge.id,
      position: 0,
      selectedOptionId: correct,
    });
    await challenges.submitAnswer(adminId, {
      challengeId: challenge.id,
      position: 0,
      selectedOptionId: wrong,
    });

    const memberState = await challenges.getState(challenge.id, memberId);
    const adminState = await challenges.getState(challenge.id, adminId);
    expect(memberState.self.scoreboard?.score).toBe(1);
    expect(adminState.self.scoreboard?.score).toBe(-1);
    expect(memberState.self.scoreboard?.correct).toBe(1);
    expect(adminState.self.scoreboard?.wrong).toBe(1);
  });

  it('enforces the minimum reading time on the server', async () => {
    const challenge = await createChallenge('quantitative');
    const now = new Date();
    await prisma.challenge.update({
      where: { id: challenge.id },
      data: {
        status: 'LIVE',
        minReadingSeconds: 60,
        startedAt: now,
        endsAt: new Date(now.getTime() + 300_000),
      },
    });
    const problemId = await problemIdAt(challenge.id, 0);
    const correct = await optionAt(problemId, true);
    await expect(
      challenges.submitAnswer(memberId, {
        challengeId: challenge.id,
        position: 0,
        selectedOptionId: correct,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('treats a duplicate submission as an idempotent replay', async () => {
    const challenge = await createChallenge('quantitative');
    await goLive(challenge.id, 0);
    const problemId = await problemIdAt(challenge.id, 0);
    const correct = await optionAt(problemId, true);
    const wrong = await optionAt(problemId, false);

    const first = await challenges.submitAnswer(memberId, {
      challengeId: challenge.id,
      position: 0,
      selectedOptionId: correct,
    });
    const replay = await challenges.submitAnswer(memberId, {
      challengeId: challenge.id,
      position: 0,
      selectedOptionId: wrong,
    });
    expect(first.answeredCount).toBe(1);
    expect(replay.answeredCount).toBe(1);
    const rows = await prisma.challengeAnswer.count({
      where: { challengeId: challenge.id, playerId: memberId },
    });
    expect(rows).toBe(1);
  });

  it('rejects an option that does not belong to the question', async () => {
    const challenge = await createChallenge('quantitative');
    await goLive(challenge.id, 0);
    const otherProblem = await prisma.problem.findFirstOrThrow({
      where: { status: 'PUBLISHED', id: { not: await problemIdAt(challenge.id, 0) } },
      select: { id: true },
    });
    const foreign = await optionAt(otherProblem.id, true);
    await expect(
      challenges.submitAnswer(memberId, {
        challengeId: challenge.id,
        position: 0,
        selectedOptionId: foreign,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects submissions from non-members', async () => {
    const challenge = await createChallenge('quantitative');
    await goLive(challenge.id, 0);
    const problemId = await problemIdAt(challenge.id, 0);
    const correct = await optionAt(problemId, true);
    await expect(
      challenges.submitAnswer('00000000-0000-4000-8000-000000000000', {
        challengeId: challenge.id,
        position: 0,
        selectedOptionId: correct,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('completes exactly once and derives the winner from final score', async () => {
    const challenge = await createChallenge('quantitative');
    await goLive(challenge.id, 0);
    const total = challenge.questionCount;
    for (let position = 0; position < total; position += 1) {
      const problemId = await problemIdAt(challenge.id, position);
      const correct = await optionAt(problemId, true);
      const wrong = await optionAt(problemId, false);
      // Member gets all correct, admin alternates to guarantee a lower score.
      await challenges.submitAnswer(memberId, {
        challengeId: challenge.id,
        position,
        selectedOptionId: correct,
      });
      await challenges.submitAnswer(adminId, {
        challengeId: challenge.id,
        position,
        selectedOptionId: position === 0 ? correct : wrong,
      });
    }

    const loaded = await challenges.loadChallenge(challenge.id);
    expect(loaded.status).toBe('COMPLETED');
    const winnerId = loaded.player1Id === memberId ? loaded.player1Score : loaded.player2Score;
    const loserId = loaded.player1Id === memberId ? loaded.player2Score : loaded.player1Score;
    expect(winnerId).toBe(total);
    expect(loserId).toBe(total - 2 * (total - 1));
    expect(loaded.winnerId).toBe(memberId);

    // A second finalize attempt must not change the persisted result.
    await challenges.finalizeOnce(challenge.id, 'COMPLETED');
    const again = await challenges.loadChallenge(challenge.id);
    expect(again.endedAt?.getTime()).toBe(loaded.endedAt?.getTime());
    expect(again.player1Score).toBe(loaded.player1Score);
    expect(again.player2Score).toBe(loaded.player2Score);
  }, 60_000);

  it('resolves simultaneous final answers to a single completed result', async () => {
    const challenge = await createChallenge('quantitative');
    await goLive(challenge.id, 0);
    const total = challenge.questionCount;
    for (let position = 0; position < total - 1; position += 1) {
      const problemId = await problemIdAt(challenge.id, position);
      const correct = await optionAt(problemId, true);
      await challenges.submitAnswer(memberId, {
        challengeId: challenge.id,
        position,
        selectedOptionId: correct,
      });
      await challenges.submitAnswer(adminId, {
        challengeId: challenge.id,
        position,
        selectedOptionId: correct,
      });
    }
    const lastPosition = total - 1;
    const lastProblem = await problemIdAt(challenge.id, lastPosition);
    const correct = await optionAt(lastProblem, true);

    await Promise.all([
      challenges.submitAnswer(memberId, {
        challengeId: challenge.id,
        position: lastPosition,
        selectedOptionId: correct,
      }),
      challenges.submitAnswer(adminId, {
        challengeId: challenge.id,
        position: lastPosition,
        selectedOptionId: correct,
      }),
    ]);

    const loaded = await challenges.loadChallenge(challenge.id);
    expect(loaded.status).toBe('COMPLETED');
    expect(loaded.outcome).toBe('DRAW');
    const answerCount = await prisma.challengeAnswer.count({
      where: { challengeId: challenge.id },
    });
    expect(answerCount).toBe(total * 2);
  }, 60_000);

  it('finalizes on timer expiry', async () => {
    const challenge = await createChallenge('quantitative');
    const now = new Date();
    await prisma.challenge.update({
      where: { id: challenge.id },
      data: {
        status: 'LIVE',
        minReadingSeconds: 0,
        startedAt: new Date(now.getTime() - 600_000),
        endsAt: new Date(now.getTime() - 1000),
      },
    });
    const synced = await challenges.syncStatus(await challenges.loadChallenge(challenge.id));
    expect(synced.status).toBe('COMPLETED');
    expect(synced.completionReason).toBe('TIMER_EXPIRED');
  });

  it('records abandonment with the remaining player as winner', async () => {
    const challenge = await createChallenge('quantitative');
    await goLive(challenge.id, 0);
    await challenges.markAbandoned(challenge.id, adminId);
    const loaded = await challenges.loadChallenge(challenge.id);
    expect(loaded.status).toBe('ABANDONED');
    expect(loaded.completionReason).toBe('ABANDONED');
    expect(loaded.winnerId).toBe(memberId);
  });

  it('exposes a deterministic next-problem style result payload without answers before completion', async () => {
    const challenge = await createChallenge('quantitative');
    const state = await challenges.getState(challenge.id, memberId);
    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain('isCorrect');
    expect(state.status).toBe('COUNTDOWN');
  });

  it('returns offset-paginated history for the caller', async () => {
    const first = await challenges.history(memberId, { limit: 1, offset: 0 });
    expect(first.items.length).toBeGreaterThan(0);
    expect(first.items[0]?.opponent.id).toBeDefined();
    expect(first.total).toBeGreaterThanOrEqual(first.items.length);
    expect(first.hasMore).toBe(first.offset + first.items.length < first.total);
    const second = await challenges.history(memberId, { limit: 1, offset: 1 });
    expect(second.offset).toBe(1);
    if (second.items.length > 0 && first.total > 1) {
      expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
    }
  });

  it('returns history stats for the caller', async () => {
    const stats = await challenges.historyStats(memberId, {});
    expect(stats.matches).toBeGreaterThanOrEqual(0);
    expect(stats.wins + stats.losses + stats.draws).toBe(stats.matches);
  });

  it('exposes the active challenge for the caller', async () => {
    const challenge = await createChallenge('quantitative');
    await goLive(challenge.id, 0);
    const active = await challenges.activeChallenge(memberId);
    expect(active?.id).toBe(challenge.id);
  });

  it('resolves the deterministic winner rules in isolation', () => {
    const base = { username: 'x', displayName: 'X', avatarKey: null, rating: 1000 };
    const p1 = { ...base, id: 'p1', correct: 5, wrong: 2 };
    const p2 = { ...base, id: 'p2', correct: 3, wrong: 1 };
    expect(results.resolve(p1, p2, 10).outcome).toBe('PLAYER1_WIN');

    const tie = results.resolve(
      { ...base, id: 'p1', correct: 3, wrong: 1 },
      { ...base, id: 'p2', correct: 3, wrong: 1 },
      10,
    );
    expect(tie.outcome).toBe('DRAW');
    expect(tie.winnerId).toBeNull();

    const tieCorrect = results.resolve(
      { ...base, id: 'p1', correct: 4, wrong: 2 },
      { ...base, id: 'p2', correct: 3, wrong: 1 },
      10,
    );
    expect(tieCorrect.outcome).toBe('PLAYER1_WIN');
  });
});
