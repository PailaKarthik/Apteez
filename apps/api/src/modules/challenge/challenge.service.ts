import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@apteez/database';
import type {
  ChallengeAnswerAckDto,
  ChallengeCompletionReason,
  ChallengeConfigDto,
  ChallengeHistoryEntryDto,
  ChallengeOpponentDto,
  ChallengeOpponentProgressDto,
  ChallengeOutcome,
  ChallengeQuestionViewDto,
  ChallengeResultDto,
  ChallengeScoreboardDto,
  ChallengeStateDto,
  ChallengeStatus,
  CursorPage,
  RatingProcessingStatus,
} from '@apteez/types';
import type { ChallengeAnswerInput, ChallengeHistoryQuery } from '@apteez/validation';
import { AppLogger } from '../../common/logger/app-logger';
import { ChallengeQueueService } from '../../queue/challenge-queue.service';
import { RedisLockService } from '../../redis/redis-lock.service';
import { StorageService } from '../../storage/storage.service';
import {
  ChallengeNotFoundError,
  ChallengeStateError,
  QuestionExpiredError,
  QuestionNotActiveError,
  ReadingTimeError,
} from './challenge.errors';
import { ChallengeEvents } from './challenge.events';
import { ChallengeLiveStateService } from './challenge-live-state.service';
import { ChallengeResultService } from './challenge-result.service';
import { RatingService } from '../rating/rating.service';
import { LIVE_RETENTION_SECONDS, buildChallengeConfig } from './challenge.config';
import { buildScoreboard, canTransition, computeScore, isTerminal } from './challenge.util';
import type { MatchPair } from './matchmaking.service';
import { decodeProblemCursor, encodeProblemCursor } from '../problems/problem-cursor';

interface PlayerSnapshot {
  id: string;
  username: string | null;
  displayName: string;
  avatarKey: string | null;
  rating: number;
}

interface QuestionRow {
  id: string;
  position: number;
  problemId: string;
}

interface LoadedChallenge {
  id: string;
  domainSlug: string;
  categoryId: string;
  categoryName: string;
  player1Id: string;
  player2Id: string;
  player1: PlayerSnapshot;
  player2: PlayerSnapshot;
  player1RatingSnapshot: number;
  player2RatingSnapshot: number;
  status: ChallengeStatus;
  outcome: ChallengeOutcome | null;
  completionReason: ChallengeCompletionReason | null;
  winnerId: string | null;
  player1Score: number | null;
  player2Score: number | null;
  player1Correct: number | null;
  player2Correct: number | null;
  player1Wrong: number | null;
  player2Wrong: number | null;
  player1Unanswered: number | null;
  player2Unanswered: number | null;
  questionCount: number;
  durationSeconds: number;
  minReadingSeconds: number;
  ratingStatus: RatingProcessingStatus;
  matchedAt: Date | null;
  startedAt: Date | null;
  endsAt: Date | null;
  endedAt: Date | null;
  questions: QuestionRow[];
  answeredByPlayer: Map<
    string,
    Map<number, { optionId: string | null; isCorrect: boolean; answeredAt: Date }>
  >;
}

interface ContentBundle {
  statement: string | null;
  contentMode: 'TEXT_ONLY' | 'IMAGE_ONLY' | 'TEXT_AND_IMAGE';
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  title: string;
  assets: Array<{
    id: string;
    kind: string;
    url: string;
    mimeType: string;
    position: number;
    altText: string | null;
  }>;
  options: Array<{ id: string; position: number; text: string | null; assetUrl: string | null }>;
}

const FINALIZE_LOCK_TTL_MS = 5_000;

/**
 * Server-authoritative 1v1 challenge engine.
 *
 * Everything competitive is computed here: the timeline (matchedAt/startedAt/
 * endsAt), question order, correctness, +1/−1 scoring and the winner. Clients
 * only ever *identify* an option. Question content is fetched without the
 * `isCorrect` column, so a pre-completion payload cannot leak the answer.
 *
 * Finalization is a single atomic `updateMany` claim under a distributed
 * finalize lock, guaranteeing exactly one persisted result per challenge even
 * under simultaneous completion or duplicate background jobs. Ephemeral live
 * state is written here and cleared after finalization — PostgreSQL remains
 * authoritative, so a Redis failure never changes a result.
 */
@Injectable()
export class ChallengeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly results: ChallengeResultService,
    private readonly events: ChallengeEvents,
    private readonly liveState: ChallengeLiveStateService,
    private readonly lock: RedisLockService,
    private readonly ratings: RatingService,
    private readonly queue: ChallengeQueueService,
    private readonly logger: AppLogger,
  ) {}

  /** Domains available for matchmaking, with published-problem counts. */
  async listDomains(): Promise<
    Array<{ slug: string; name: string; icon: string | null; problemCount: number }>
  > {
    const rows = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        slug: true,
        name: true,
        icon: true,
        _count: { select: { problems: { where: { status: 'PUBLISHED' } } } },
      },
    });
    return rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      icon: row.icon,
      problemCount: row._count.problems,
    }));
  }

  /** The caller's current non-terminal challenge, if any. */
  async activeChallenge(userId: string): Promise<ChallengeStateDto | null> {
    const row = await this.prisma.challenge.findFirst({
      where: {
        OR: [{ player1Id: userId }, { player2Id: userId }],
        status: { in: ['MATCHMAKING', 'MATCHED', 'COUNTDOWN', 'LIVE'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!row) {
      return null;
    }
    return this.getState(row.id, userId);
  }

  async createFromMatch(pair: MatchPair): Promise<LoadedChallenge> {
    const category = await this.prisma.category.findUniqueOrThrow({
      where: { slug: pair.player1.domainSlug },
      select: { id: true, name: true },
    });
    const config = buildChallengeConfig(pair.player1.domainSlug);
    const problemIds = await this.selectQuestions(category.id, pair, config);
    if (problemIds.length === 0) {
      throw new ChallengeStateError('No published problems are available for this domain yet.');
    }
    const now = new Date();
    const startedAt = new Date(now.getTime() + config.countdownSeconds * 1000);
    const endsAt = new Date(startedAt.getTime() + config.durationSeconds * 1000);

    await Promise.all([
      this.prisma.challengeRating.upsert({
        where: {
          userId_domainSlug: { userId: pair.player1.userId, domainSlug: pair.player1.domainSlug },
        },
        update: {},
        create: {
          userId: pair.player1.userId,
          domainSlug: pair.player1.domainSlug,
          categoryId: category.id,
          rating: pair.player1.rating,
        },
      }),
      this.prisma.challengeRating.upsert({
        where: {
          userId_domainSlug: { userId: pair.player2.userId, domainSlug: pair.player1.domainSlug },
        },
        update: {},
        create: {
          userId: pair.player2.userId,
          domainSlug: pair.player1.domainSlug,
          categoryId: category.id,
          rating: pair.player2.rating,
        },
      }),
    ]);

    const created = await this.prisma.challenge.create({
      data: {
        domainSlug: pair.player1.domainSlug,
        categoryId: category.id,
        player1Id: pair.player1.userId,
        player2Id: pair.player2.userId,
        player1RatingSnapshot: pair.player1.rating,
        player2RatingSnapshot: pair.player2.rating,
        status: 'COUNTDOWN',
        questionCount: problemIds.length,
        durationSeconds: config.durationSeconds,
        minReadingSeconds: config.minReadingSeconds,
        matchedAt: now,
        startedAt,
        endsAt,
        questions: {
          create: problemIds.map((problemId, position) => ({ problemId, position })),
        },
      },
      select: { id: true },
    });
    this.logger.log(
      `challenge.created id=${created.id} domain=${pair.player1.domainSlug} p1=${pair.player1.userId} p2=${pair.player2.userId} questions=${problemIds.length}`,
      'Challenge',
    );
    const loaded = await this.loadChallenge(created.id);
    await this.liveState.writeLiveState(
      {
        challengeId: loaded.id,
        status: loaded.status,
        player1Id: loaded.player1Id,
        player2Id: loaded.player2Id,
        questionCount: loaded.questionCount,
        startedAt: loaded.startedAt?.toISOString() ?? null,
        endsAt: loaded.endsAt?.toISOString() ?? null,
        updatedAt: new Date().toISOString(),
      },
      LIVE_RETENTION_SECONDS,
    );
    await this.liveState.setActiveUser(loaded.player1Id, loaded.id, LIVE_RETENTION_SECONDS);
    await this.liveState.setActiveUser(loaded.player2Id, loaded.id, LIVE_RETENTION_SECONDS);
    this.events.emitChallengeUpdated({
      challengeId: loaded.id,
      player1Id: loaded.player1Id,
      player2Id: loaded.player2Id,
      status: loaded.status,
    });
    return loaded;
  }

  private async selectQuestions(
    categoryId: string,
    pair: MatchPair,
    config: ChallengeConfigDto,
  ): Promise<string[]> {
    const target = (pair.player1.rating + pair.player2.rating) / 2;
    const candidates = await this.prisma.problem.findMany({
      where: { status: 'PUBLISHED', categoryId },
      select: { id: true, rating: true },
    });
    if (candidates.length === 0) {
      return [];
    }
    const ranked = candidates
      .map((candidate) => ({ ...candidate, distance: Math.abs(candidate.rating - target) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, config.questionCount * 4);
    for (let i = ranked.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [ranked[i], ranked[j]] = [ranked[j]!, ranked[i]!];
    }
    return ranked.slice(0, config.questionCount).map((candidate) => candidate.id);
  }

  async loadChallenge(challengeId: string): Promise<LoadedChallenge> {
    const row = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        category: { select: { name: true } },
        player1: { select: { id: true, username: true, displayName: true, avatarKey: true } },
        player2: { select: { id: true, username: true, displayName: true, avatarKey: true } },
        questions: {
          select: { id: true, position: true, problemId: true },
          orderBy: { position: 'asc' },
        },
        answers: {
          select: {
            playerId: true,
            challengeQuestion: { select: { position: true } },
            selectedOptionId: true,
            isCorrect: true,
            answeredAt: true,
          },
        },
      },
    });
    if (!row) {
      throw new ChallengeNotFoundError();
    }
    const answeredByPlayer = new Map<
      string,
      Map<number, { optionId: string | null; isCorrect: boolean; answeredAt: Date }>
    >();
    for (const answer of row.answers) {
      const perPlayer = answeredByPlayer.get(answer.playerId) ?? new Map();
      perPlayer.set(answer.challengeQuestion.position, {
        optionId: answer.selectedOptionId,
        isCorrect: answer.isCorrect,
        answeredAt: answer.answeredAt,
      });
      answeredByPlayer.set(answer.playerId, perPlayer);
    }
    return {
      id: row.id,
      domainSlug: row.domainSlug,
      categoryId: row.categoryId,
      categoryName: row.category.name,
      player1Id: row.player1Id,
      player2Id: row.player2Id,
      player1: { ...row.player1, rating: row.player1RatingSnapshot },
      player2: { ...row.player2, rating: row.player2RatingSnapshot },
      player1RatingSnapshot: row.player1RatingSnapshot,
      player2RatingSnapshot: row.player2RatingSnapshot,
      status: row.status,
      outcome: row.outcome,
      completionReason: row.completionReason,
      winnerId: row.winnerId,
      player1Score: row.player1Score,
      player2Score: row.player2Score,
      player1Correct: row.player1Correct,
      player2Correct: row.player2Correct,
      player1Wrong: row.player1Wrong,
      player2Wrong: row.player2Wrong,
      player1Unanswered: row.player1Unanswered,
      player2Unanswered: row.player2Unanswered,
      questionCount: row.questionCount,
      durationSeconds: row.durationSeconds,
      minReadingSeconds: row.minReadingSeconds,
      ratingStatus: row.ratingStatus,
      matchedAt: row.matchedAt,
      startedAt: row.startedAt,
      endsAt: row.endsAt,
      endedAt: row.endedAt,
      questions: row.questions,
      answeredByPlayer,
    };
  }

  /** Promotes COUNTDOWN→LIVE and completes on timer expiry, based on the clock. */
  async syncStatus(challenge: LoadedChallenge): Promise<LoadedChallenge> {
    const now = Date.now();
    if (
      challenge.status === 'COUNTDOWN' &&
      challenge.startedAt &&
      now >= challenge.startedAt.getTime()
    ) {
      const updated = await this.prisma.challenge.updateMany({
        where: { id: challenge.id, status: 'COUNTDOWN' },
        data: { status: 'LIVE' },
      });
      if (updated.count > 0) {
        challenge.status = 'LIVE';
        this.events.emitChallengeUpdated({
          challengeId: challenge.id,
          player1Id: challenge.player1Id,
          player2Id: challenge.player2Id,
          status: 'LIVE',
        });
      }
      return challenge;
    }
    if (challenge.status === 'LIVE' && challenge.endsAt && now >= challenge.endsAt.getTime()) {
      await this.finalizeOnce(challenge.id, 'TIMER_EXPIRED');
      return this.loadChallenge(challenge.id);
    }
    return challenge;
  }

  async getState(challengeId: string, userId: string): Promise<ChallengeStateDto> {
    let challenge = await this.loadChallenge(challengeId);
    challenge = await this.syncStatus(challenge);
    this.assertMember(challenge, userId);
    return this.buildState(challenge, userId);
  }

  async buildState(challenge: LoadedChallenge, userId: string): Promise<ChallengeStateDto> {
    const isPlayer1 = challenge.player1Id === userId;
    const self = isPlayer1 ? challenge.player1 : challenge.player2;
    const opponentSnapshot = isPlayer1 ? challenge.player2 : challenge.player1;
    const selfAnswers = challenge.answeredByPlayer.get(userId) ?? new Map();
    const opponentId = isPlayer1 ? challenge.player2Id : challenge.player1Id;
    const opponentAnswers = challenge.answeredByPlayer.get(opponentId) ?? new Map();
    const config = buildChallengeConfig(challenge.domainSlug);

    const connected = await this.connectionStates(challenge.id, [userId, opponentId]);
    const currentPosition = selfAnswers.size;
    const question =
      currentPosition < challenge.questionCount
        ? await this.buildQuestionView(challenge, currentPosition, selfAnswers)
        : null;

    const live = challenge.status === 'LIVE' || challenge.status === 'COMPLETED';
    const selfScoreboard: ChallengeScoreboardDto | null = live
      ? this.scoreboardFrom(selfAnswers, challenge.questionCount)
      : null;

    const opponent: ChallengeOpponentDto = {
      id: opponentSnapshot.id,
      username: opponentSnapshot.username,
      displayName: opponentSnapshot.displayName,
      avatarKey: opponentSnapshot.avatarKey,
      rating: opponentSnapshot.rating,
      score: live ? computeScoreFrom(opponentAnswers) : null,
      answeredCount: opponentAnswers.size,
      connected: connected[opponentId] ?? true,
    };

    return {
      id: challenge.id,
      domainSlug: challenge.domainSlug,
      domainName: challenge.categoryName,
      status: challenge.status,
      config,
      self: {
        id: self.id,
        rating: self.rating,
        scoreboard: selfScoreboard,
        answeredCount: selfAnswers.size,
      },
      opponent,
      serverTime: new Date().toISOString(),
      countdownEndsAt: challenge.startedAt?.toISOString() ?? null,
      startedAt: challenge.startedAt?.toISOString() ?? null,
      endsAt: challenge.endsAt?.toISOString() ?? null,
      question,
      questionCount: challenge.questionCount,
      answeredPositions: [...selfAnswers.keys()].sort((a, b) => a - b),
    };
  }

  private scoreboardFrom(
    answers: Map<number, { isCorrect: boolean }>,
    total: number,
  ): ChallengeScoreboardDto {
    let correct = 0;
    let wrong = 0;
    for (const answer of answers.values()) {
      if (answer.isCorrect) {
        correct += 1;
      } else {
        wrong += 1;
      }
    }
    return buildScoreboard(correct, wrong, total);
  }

  private async buildQuestionView(
    challenge: LoadedChallenge,
    position: number,
    selfAnswers: Map<number, { answeredAt: Date }>,
  ): Promise<ChallengeQuestionViewDto | null> {
    const question = challenge.questions.find((row) => row.position === position);
    if (!question) {
      return null;
    }
    const content = await this.loadContent(question.problemId);
    const previous = selfAnswers.get(position - 1);
    const base = previous
      ? previous.answeredAt.getTime()
      : (challenge.startedAt?.getTime() ?? Date.now());
    const answerableAt = new Date(base + challenge.minReadingSeconds * 1000);
    return {
      position,
      problemId: question.problemId,
      title: content.title,
      statement: content.statement,
      difficulty: content.difficulty,
      contentMode: content.contentMode,
      assets: content.assets.map((asset) => ({
        id: asset.id,
        kind: asset.kind as ChallengeQuestionViewDto['assets'][number]['kind'],
        url: asset.url,
        mimeType: asset.mimeType,
        position: asset.position,
        altText: asset.altText,
      })),
      options: content.options,
      answerableAt: answerableAt.toISOString(),
    };
  }

  private async loadContent(problemId: string): Promise<ContentBundle> {
    const problem = await this.prisma.problem.findUniqueOrThrow({
      where: { id: problemId },
      select: {
        title: true,
        statement: true,
        contentMode: true,
        difficulty: true,
        assets: {
          select: {
            id: true,
            kind: true,
            objectKey: true,
            mimeType: true,
            position: true,
            altText: true,
          },
          orderBy: { position: 'asc' },
        },
        options: {
          select: { id: true, position: true, text: true, assetKey: true },
          orderBy: { position: 'asc' },
        },
      },
    });
    const keys = [
      ...problem.assets.map((asset) => asset.objectKey),
      ...problem.options.flatMap((option) => (option.assetKey ? [option.assetKey] : [])),
    ];
    const urlByKey = await this.storage.getDownloadUrls(keys);
    return {
      title: problem.title,
      statement: problem.statement,
      contentMode: problem.contentMode,
      difficulty: problem.difficulty,
      assets: problem.assets.map((asset) => ({
        id: asset.id,
        kind: asset.kind,
        url: urlByKey.get(asset.objectKey) ?? '',
        mimeType: asset.mimeType,
        position: asset.position,
        altText: asset.altText,
      })),
      options: problem.options.map((option) => ({
        id: option.id,
        position: option.position,
        text: option.text,
        assetUrl: option.assetKey ? (urlByKey.get(option.assetKey) ?? null) : null,
      })),
    };
  }

  async submitAnswer(userId: string, input: ChallengeAnswerInput): Promise<ChallengeAnswerAckDto> {
    const challenge = await this.syncStatus(await this.loadChallenge(input.challengeId));
    this.assertMember(challenge, userId);
    if (isTerminal(challenge.status)) {
      throw new ChallengeStateError('This challenge has already finished.');
    }
    if (challenge.status !== 'LIVE') {
      throw new ChallengeStateError('The challenge has not started yet.');
    }
    const selfAnswers = challenge.answeredByPlayer.get(userId) ?? new Map();
    const currentPosition = selfAnswers.size;
    const existing = selfAnswers.get(input.position);
    if (existing) {
      const next = await this.buildQuestionView(challenge, currentPosition, selfAnswers);
      return {
        accepted: true,
        position: input.position,
        answeredCount: selfAnswers.size,
        nextQuestion: next,
      };
    }
    if (input.position !== currentPosition) {
      throw new QuestionNotActiveError();
    }
    const question = challenge.questions.find((row) => row.position === input.position);
    if (!question) {
      throw new QuestionNotActiveError();
    }
    const previous = selfAnswers.get(input.position - 1);
    const base = previous
      ? previous.answeredAt.getTime()
      : (challenge.startedAt?.getTime() ?? Date.now());
    const answerableAt = base + challenge.minReadingSeconds * 1000;
    const now = new Date();
    if (now.getTime() < answerableAt) {
      throw new ReadingTimeError();
    }
    if (challenge.endsAt && now.getTime() > challenge.endsAt.getTime()) {
      throw new QuestionExpiredError();
    }
    const option = await this.prisma.problemOption.findFirst({
      where: { id: input.selectedOptionId, problemId: question.problemId },
      select: { id: true, isCorrect: true },
    });
    if (!option) {
      throw new QuestionNotActiveError('That option does not belong to the current question.');
    }
    try {
      await this.prisma.challengeAnswer.create({
        data: {
          challengeId: challenge.id,
          challengeQuestionId: question.id,
          playerId: userId,
          selectedOptionId: option.id,
          isCorrect: option.isCorrect,
          answeredAt: now,
          responseTimeMs: Math.max(0, now.getTime() - base),
          clientReportedMs: input.clientElapsedMs ?? null,
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      // Concurrent duplicate: the first write stands.
    }

    const refreshed = await this.loadChallenge(challenge.id);
    const selfMap = refreshed.answeredByPlayer.get(userId) ?? new Map();
    const bothDone =
      (refreshed.answeredByPlayer.get(refreshed.player1Id)?.size ?? 0) >= refreshed.questionCount &&
      (refreshed.answeredByPlayer.get(refreshed.player2Id)?.size ?? 0) >= refreshed.questionCount;
    if (bothDone) {
      await this.finalizeOnce(refreshed.id, 'COMPLETED');
    }
    const nextPosition = selfMap.size;
    const next =
      nextPosition < refreshed.questionCount
        ? await this.buildQuestionView(refreshed, nextPosition, selfMap)
        : null;
    this.events.emitChallengeUpdated({
      challengeId: refreshed.id,
      player1Id: refreshed.player1Id,
      player2Id: refreshed.player2Id,
      status: refreshed.status,
    });
    return {
      accepted: true,
      position: input.position,
      answeredCount: selfMap.size,
      nextQuestion: next,
    };
  }

  async finalizeOnce(
    challengeId: string,
    reason: ChallengeCompletionReason,
    abandonerId?: string,
  ): Promise<void> {
    await this.lock.withLock(
      `challenge:finalize:${challengeId}`,
      FINALIZE_LOCK_TTL_MS,
      async () => {
        await this.runFinalize(challengeId, reason, abandonerId);
      },
    );
  }

  private async runFinalize(
    challengeId: string,
    reason: ChallengeCompletionReason,
    abandonerId?: string,
  ): Promise<void> {
    const challenge = await this.loadChallenge(challengeId);
    if (isTerminal(challenge.status)) {
      return;
    }
    const now = new Date();
    const sourceStatuses: ChallengeStatus[] = ['MATCHMAKING', 'MATCHED', 'COUNTDOWN', 'LIVE'];

    let data: Prisma.ChallengeUncheckedUpdateManyInput;
    let outcome: ChallengeOutcome;

    if (reason === 'ABANDONED' || reason === 'DISCONNECT_TIMEOUT') {
      const resolved = this.results.abandon(
        challenge.player1Id,
        challenge.player2Id,
        abandonerId ?? challenge.player1Id,
      );
      outcome = resolved.outcome;
      data = {
        status: 'ABANDONED',
        outcome,
        completionReason: reason,
        winnerId: resolved.winnerId,
        endedAt: now,
        player1Score: resolved.player1Score,
        player2Score: resolved.player2Score,
        player1Correct: 0,
        player2Correct: 0,
        player1Wrong: 0,
        player2Wrong: 0,
        player1Unanswered: challenge.questionCount,
        player2Unanswered: challenge.questionCount,
      };
    } else if (reason === 'CANCELLED') {
      data = {
        status: 'CANCELLED',
        outcome: 'CANCELLED',
        completionReason: 'CANCELLED',
        endedAt: now,
      };
      outcome = 'CANCELLED';
    } else {
      const p1 = challenge.answeredByPlayer.get(challenge.player1Id) ?? new Map();
      const p2 = challenge.answeredByPlayer.get(challenge.player2Id) ?? new Map();
      const resolved = this.results.resolve(
        { ...challenge.player1, correct: countCorrect(p1), wrong: countWrong(p1) },
        { ...challenge.player2, correct: countCorrect(p2), wrong: countWrong(p2) },
        challenge.questionCount,
      );
      outcome = resolved.outcome;
      data = {
        status: 'COMPLETED',
        outcome,
        completionReason: reason,
        winnerId: resolved.winnerId,
        endedAt: now,
        player1Score: resolved.player1Score,
        player2Score: resolved.player2Score,
        player1Correct: resolved.player1Scoreboard.correct,
        player2Correct: resolved.player2Scoreboard.correct,
        player1Wrong: resolved.player1Scoreboard.wrong,
        player2Wrong: resolved.player2Scoreboard.wrong,
        player1Unanswered: resolved.player1Scoreboard.unanswered,
        player2Unanswered: resolved.player2Scoreboard.unanswered,
      };
    }

    const claimed = await this.prisma.challenge.updateMany({
      where: { id: challengeId, status: { in: sourceStatuses } },
      data,
    });
    if (claimed.count === 0) {
      return;
    }
    await this.prisma.challengeRating.updateMany({
      where: {
        domainSlug: challenge.domainSlug,
        userId: { in: [challenge.player1Id, challenge.player2Id] },
      },
      data: { lastPlayedAt: now, gamesPlayed: { increment: 1 } },
    });
    if (outcome === 'DRAW') {
      await this.prisma.challengeRating.updateMany({
        where: {
          domainSlug: challenge.domainSlug,
          userId: { in: [challenge.player1Id, challenge.player2Id] },
        },
        data: { draws: { increment: 1 } },
      });
    } else if (reason === 'COMPLETED' || reason === 'TIMER_EXPIRED') {
      const loserId = outcome === 'PLAYER1_WIN' ? challenge.player2Id : challenge.player1Id;
      const winnerId = outcome === 'PLAYER1_WIN' ? challenge.player1Id : challenge.player2Id;
      await this.prisma.challengeRating.updateMany({
        where: { domainSlug: challenge.domainSlug, userId: winnerId },
        data: { wins: { increment: 1 } },
      });
      await this.prisma.challengeRating.updateMany({
        where: { domainSlug: challenge.domainSlug, userId: loserId },
        data: { losses: { increment: 1 } },
      });
    }
    this.logger.log(
      `challenge.finalized id=${challengeId} reason=${reason} outcome=${outcome}`,
      'Challenge',
    );
    await this.liveState.clearChallengeState(challengeId);
    await this.liveState.clearActiveUser(challenge.player1Id);
    await this.liveState.clearActiveUser(challenge.player2Id);
    // Only a genuinely completed match moves ratings. Enqueue the (idempotent)
    // rating job after the challenge is durably finalized, so a rating failure
    // never rolls back the result.
    if (data.status === 'COMPLETED') {
      await this.queue.enqueueRatingUpdate(challengeId);
    }
    this.events.emitChallengeUpdated({
      challengeId,
      player1Id: challenge.player1Id,
      player2Id: challenge.player2Id,
      status: data.status as ChallengeStatus,
    });
  }

  async markAbandoned(challengeId: string, userId: string): Promise<void> {
    await this.finalizeOnce(challengeId, 'ABANDONED', userId);
  }

  async markDisconnectedTimeout(challengeId: string, userId: string): Promise<void> {
    await this.finalizeOnce(challengeId, 'DISCONNECT_TIMEOUT', userId);
  }

  async cancel(challengeId: string, userId: string): Promise<void> {
    const challenge = await this.loadChallenge(challengeId);
    this.assertMember(challenge, userId);
    await this.finalizeOnce(challengeId, 'CANCELLED');
  }

  async buildResult(challengeId: string, userId: string): Promise<ChallengeResultDto> {
    const challenge = await this.loadChallenge(challengeId);
    this.assertMember(challenge, userId);
    const meta = await this.questionMetaFor(challenge);
    const p1 = challenge.answeredByPlayer.get(challenge.player1Id) ?? new Map();
    const p2 = challenge.answeredByPlayer.get(challenge.player2Id) ?? new Map();
    const p1Correct = countCorrect(p1);
    const p1Wrong = countWrong(p1);
    const p2Correct = countCorrect(p2);
    const p2Wrong = countWrong(p2);
    const ratingChanges = await this.ratings.changesFor(challenge.id);
    const durationSeconds =
      challenge.startedAt && challenge.endedAt
        ? Math.max(
            0,
            Math.round((challenge.endedAt.getTime() - challenge.startedAt.getTime()) / 1000),
          )
        : challenge.durationSeconds;
    return {
      id: challenge.id,
      domainSlug: challenge.domainSlug,
      domainName: challenge.categoryName,
      outcome: challenge.outcome ?? 'CANCELLED',
      completionReason: challenge.completionReason ?? 'CANCELLED',
      winnerId: challenge.winnerId,
      durationSeconds,
      startedAt: challenge.startedAt?.toISOString() ?? null,
      endedAt: challenge.endedAt?.toISOString() ?? null,
      player1: {
        ...challenge.player1,
        correct: p1Correct,
        wrong: p1Wrong,
        unanswered: Math.max(0, challenge.questionCount - p1Correct - p1Wrong),
        score: computeScore(p1Correct, p1Wrong),
      },
      player2: {
        ...challenge.player2,
        correct: p2Correct,
        wrong: p2Wrong,
        unanswered: Math.max(0, challenge.questionCount - p2Correct - p2Wrong),
        score: computeScore(p2Correct, p2Wrong),
      },
      questions: challenge.questions.map((question) => ({
        position: question.position,
        problemId: question.problemId,
        title: meta.get(question.problemId)?.title ?? '',
        correctOptionId: meta.get(question.problemId)?.correctOptionId ?? null,
        player1OptionId: p1.get(question.position)?.optionId ?? null,
        player2OptionId: p2.get(question.position)?.optionId ?? null,
      })),
      ratingChange: {
        self: ratingChanges.get(userId) ?? null,
        opponent:
          ratingChanges.get(
            userId === challenge.player1Id ? challenge.player2Id : challenge.player1Id,
          ) ?? null,
      },
      ratingStatus: challenge.ratingStatus,
    };
  }

  private async questionMetaFor(
    challenge: LoadedChallenge,
  ): Promise<Map<string, { title: string; correctOptionId: string | null }>> {
    const problemIds = challenge.questions.map((question) => question.problemId);
    const problems = await this.prisma.problem.findMany({
      where: { id: { in: problemIds } },
      select: {
        id: true,
        title: true,
        options: { where: { isCorrect: true }, select: { id: true }, take: 1 },
      },
    });
    const map = new Map<string, { title: string; correctOptionId: string | null }>();
    for (const problem of problems) {
      map.set(problem.id, {
        title: problem.title,
        correctOptionId: problem.options[0]?.id ?? null,
      });
    }
    return map;
  }

  /** Server-authoritative score, exposed for tests and future analytics. */
  static scoreOf(correct: number, wrong: number): number {
    return correct - wrong;
  }

  async history(
    userId: string,
    query: ChallengeHistoryQuery,
  ): Promise<CursorPage<ChallengeHistoryEntryDto>> {
    let cursor: { value: string | number; id: string } | null = null;
    if (query.cursor) {
      cursor = decodeProblemCursor(query.cursor);
      if (!cursor || typeof cursor.value !== 'string' || Number.isNaN(Date.parse(cursor.value))) {
        cursor = null;
      }
    }
    const where: Prisma.ChallengeWhereInput = {
      status: { in: ['COMPLETED', 'ABANDONED', 'EXPIRED', 'CANCELLED'] },
      OR: [{ player1Id: userId }, { player2Id: userId }],
    };
    if (cursor) {
      const value = new Date(cursor.value as string);
      where.AND = [
        {
          OR: [{ endedAt: { lt: value } }, { endedAt: value, id: { lt: cursor.id } }],
        },
      ];
    }
    const rows = await this.prisma.challenge.findMany({
      where,
      orderBy: [{ endedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: {
        category: { select: { name: true } },
        player1: { select: { id: true, username: true, displayName: true, avatarKey: true } },
        player2: { select: { id: true, username: true, displayName: true, avatarKey: true } },
      },
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    const items: ChallengeHistoryEntryDto[] = page.map((row) => {
      const isPlayer1 = row.player1Id === userId;
      const opponent = isPlayer1 ? row.player2 : row.player1;
      return {
        id: row.id,
        domainSlug: row.domainSlug,
        domainName: row.category.name,
        outcome: row.outcome ?? 'CANCELLED',
        completionReason: row.completionReason ?? 'CANCELLED',
        selfScore: (isPlayer1 ? row.player1Score : row.player2Score) ?? 0,
        opponentScore: (isPlayer1 ? row.player2Score : row.player1Score) ?? 0,
        opponent: {
          id: opponent.id,
          username: opponent.username,
          displayName: opponent.displayName,
          avatarKey: opponent.avatarKey,
        },
        playedAt: (row.endedAt ?? row.createdAt).toISOString(),
        durationSeconds: row.durationSeconds,
      };
    });
    const last = page.at(-1);
    return {
      items,
      hasNextPage,
      nextCursor:
        hasNextPage && last
          ? encodeProblemCursor({
              value: (last.endedAt ?? last.createdAt).toISOString(),
              id: last.id,
            })
          : null,
    };
  }

  async connectionStates(challengeId: string, userIds: string[]): Promise<Record<string, boolean>> {
    const result: Record<string, boolean> = {};
    for (const userId of userIds) {
      result[userId] = await this.isConnected(challengeId, userId);
    }
    return result;
  }

  async isConnected(challengeId: string, userId: string): Promise<boolean> {
    return this.liveState.isConnected(challengeId, userId);
  }

  async setConnected(
    challengeId: string,
    userId: string,
    connected: boolean,
    socketId?: string,
  ): Promise<void> {
    if (connected) {
      await this.liveState.markConnected(
        challengeId,
        userId,
        socketId ?? 'session',
        LIVE_RETENTION_SECONDS,
      );
      return;
    }
    await this.liveState.markDisconnected(challengeId, userId, LIVE_RETENTION_SECONDS);
  }

  getActiveSocket(challengeId: string, userId: string): Promise<string | null> {
    return this.liveState.getActiveSocket(challengeId, userId);
  }

  async getDisconnectedAt(challengeId: string, userId: string): Promise<number | null> {
    return this.liveState.getDisconnectedAt(challengeId, userId);
  }

  opponentProgressFor(challenge: LoadedChallenge, playerId: string): ChallengeOpponentProgressDto {
    const answers = challenge.answeredByPlayer.get(playerId) ?? new Map();
    const live = challenge.status === 'LIVE';
    return {
      challengeId: challenge.id,
      userId: playerId,
      answeredCount: answers.size,
      score: live ? computeScoreFrom(answers) : null,
    };
  }

  assertMember(challenge: LoadedChallenge, userId: string): void {
    if (challenge.player1Id !== userId && challenge.player2Id !== userId) {
      throw new ChallengeNotFoundError();
    }
  }

  async transition(challengeId: string, to: ChallengeStatus): Promise<void> {
    const challenge = await this.loadChallenge(challengeId);
    if (!canTransition(challenge.status, to)) {
      throw new ChallengeStateError(`Cannot move challenge from ${challenge.status} to ${to}.`);
    }
    await this.prisma.challenge.updateMany({
      where: { id: challengeId, status: challenge.status },
      data: { status: to },
    });
  }
}

function countCorrect(answers: Map<number, { isCorrect: boolean }>): number {
  let total = 0;
  for (const answer of answers.values()) {
    if (answer.isCorrect) {
      total += 1;
    }
  }
  return total;
}

function countWrong(answers: Map<number, { isCorrect: boolean }>): number {
  let total = 0;
  for (const answer of answers.values()) {
    if (!answer.isCorrect) {
      total += 1;
    }
  }
  return total;
}

function computeScoreFrom(answers: Map<number, { isCorrect: boolean }>): number {
  return computeScore(countCorrect(answers), countWrong(answers));
}
