import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaService } from '@apteez/database';
import type {
  ChallengeAnswerAckDto,
  ChallengeCompletionReason,
  ChallengeHistoryEntryDto,
  ChallengeHistoryStatsDto,
  ChallengeOpponentDto,
  ChallengeOpponentProgressDto,
  ChallengeOutcome,
  ChallengeQuestionViewDto,
  ChallengeResultDto,
  ChallengeScoreboardDto,
  ChallengeStateDto,
  ChallengeStatus,
  OffsetPage,
  RatingProcessingStatus,
} from '@apteez/types';
import type {
  ChallengeAnswerInput,
  ChallengeHistoryQuery,
  ChallengeHistoryStatsQuery,
} from '@apteez/validation';
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

import { ChallengeLiveStateService } from './challenge-live-state.service';
import { ChallengeResultService } from './challenge-result.service';
import { RatingService } from '../rating/rating.service';
import { PointsService } from '../rewards/points.service';
import { AnalyticsService } from '../analytics/analytics.service';
import type { Env } from '../../config/env';
import {
  CHALLENGE_INITIAL_QUESTION_BATCH,
  CHALLENGE_TOPUP_BUFFER,
  LIVE_RETENTION_SECONDS,
  buildChallengeConfig,
  liveRetentionSeconds,
  resolveChallengeDurationSeconds,
} from './challenge.config';
import { buildScoreboard, canTransition, computeScore, isTerminal } from './challenge.util';
import type { MatchPair } from './matchmaking.service';

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
  /** Solo run vs the house bot: unrated, endless until the clock expires. */
  isSolo: boolean;
  ratingStatus: RatingProcessingStatus;
  ratingAttempts: number;
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
const QUESTIONS_LOCK_TTL_MS = 5_000;
/** House-bot identity: never signs in, never ranked, filtered everywhere. */
const BOT_EMAIL = 'bot@apteez.system';
/** Hot question-content cache TTL (a match re-renders the same problems). */
const CONTENT_CACHE_TTL_MS = 60_000;
const CONTENT_CACHE_MAX = 500;
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
    private readonly liveState: ChallengeLiveStateService,
    private readonly lock: RedisLockService,
    private readonly ratings: RatingService,
    private readonly queue: ChallengeQueueService,
    private readonly points: PointsService,
    private readonly analytics: AnalyticsService,
    private readonly config: ConfigService<Env, true>,
    private readonly logger: AppLogger,
  ) {}

  private readonly contentCache = new Map<string, { bundle: ContentBundle; expiresAt: number }>();
  /** Match length, seconds, from CHALLENGE_DURATION_MINUTES. */
  durationSeconds(): number {
    return resolveChallengeDurationSeconds(
      this.config.get('CHALLENGE_DURATION_MINUTES', { infer: true }),
    );
  }

  /** Solo wait, seconds, from CHALLENGE_SOLO_WAIT_SECONDS. */
  soloWaitSeconds(): number {
    return this.config.get('CHALLENGE_SOLO_WAIT_SECONDS', { infer: true });
  }

  /** Domains available for matchmaking, with published-problem counts. */
  async listDomains(): Promise<
    Array<{
      slug: string;
      name: string;
      icon: string | null;
      problemCount: number;
      durationSeconds: number;
    }>
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
    const durationSeconds = this.durationSeconds();
    return rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      icon: row.icon,
      problemCount: row._count.problems,
      durationSeconds,
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

  /** Minimal clock row for the cheap per-tick check (no joins). */
  async clockFor(
    challengeId: string,
  ): Promise<{ status: ChallengeStatus; startedAt: Date | null; endsAt: Date | null } | null> {
    return this.prisma.challenge.findUnique({
      where: { id: challengeId },
      select: { status: true, startedAt: true, endsAt: true },
    });
  }

  /** Non-terminal challenges for boot-time crash recovery (timers re-armed). */
  async nonTerminalChallenges(): Promise<
    Array<{ id: string; startedAt: Date | null; endsAt: Date | null }>
  > {
    return this.prisma.challenge.findMany({
      where: { status: { in: ['MATCHMAKING', 'MATCHED', 'COUNTDOWN', 'LIVE'] } },
      select: { id: true, startedAt: true, endsAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Authoritative timeline for job scheduling. */
  async timingFor(challengeId: string): Promise<{ startedAt: Date | null; endsAt: Date | null }> {
    const row = await this.prisma.challenge.findUniqueOrThrow({
      where: { id: challengeId },
      select: { startedAt: true, endsAt: true },
    });
    return { startedAt: row.startedAt, endsAt: row.endsAt };
  }

  async createFromMatch(pair: MatchPair): Promise<LoadedChallenge> {
    const category = await this.prisma.category.findUniqueOrThrow({
      where: { slug: pair.player1.domainSlug },
      select: { id: true, name: true },
    });
    const durationSeconds = this.durationSeconds();
    const config = buildChallengeConfig(pair.player1.domainSlug, durationSeconds);
    const problemIds = await this.selectQuestions(
      category.id,
      (pair.player1.rating + pair.player2.rating) / 2,
      [],
      CHALLENGE_INITIAL_QUESTION_BATCH,
    );
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
        isSolo: false,
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
    await this.writeEphemeralState(loaded);
    return loaded;
  }

  /**
   * Solo run against the house bot when no opponent appears in time.
   * Unrated by design (no rating rows touched, no rating job enqueued);
   * the bot never answers, so the clock alone decides the end.
   */
  async createSoloChallenge(userId: string, domainSlug: string): Promise<LoadedChallenge> {
    const category = await this.prisma.category.findFirst({
      where: { slug: domainSlug, isActive: true },
      select: { id: true, name: true },
    });
    if (!category) {
      throw new ChallengeStateError('This domain is not available right now.');
    }
    const botId = await this.ensureChallengeBot();
    const ratingRow = await this.prisma.challengeRating.upsert({
      where: { userId_domainSlug: { userId, domainSlug } },
      update: {},
      create: { userId, domainSlug, categoryId: category.id, rating: 1000 },
    });
    const durationSeconds = this.durationSeconds();
    const config = buildChallengeConfig(domainSlug, durationSeconds);
    const problemIds = await this.selectQuestions(
      category.id,
      ratingRow.rating,
      [],
      CHALLENGE_INITIAL_QUESTION_BATCH,
    );
    if (problemIds.length === 0) {
      throw new ChallengeStateError('No published problems are available for this domain yet.');
    }
    const now = new Date();
    const startedAt = new Date(now.getTime() + config.countdownSeconds * 1000);
    const endsAt = new Date(startedAt.getTime() + config.durationSeconds * 1000);
    const created = await this.prisma.challenge.create({
      data: {
        domainSlug,
        categoryId: category.id,
        player1Id: userId,
        player2Id: botId,
        player1RatingSnapshot: ratingRow.rating,
        player2RatingSnapshot: 1000,
        status: 'COUNTDOWN',
        isSolo: true,
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
      `challenge.solo id=${created.id} domain=${domainSlug} userId=${userId} questions=${problemIds.length}`,
      'Challenge',
    );
    const loaded = await this.loadChallenge(created.id);
    await this.writeEphemeralState(loaded);
    return loaded;
  }

  /** Shared ephemeral setup: live state + per-player active pointers. */
  private async writeEphemeralState(loaded: LoadedChallenge): Promise<void> {
    const retention = liveRetentionSeconds(loaded.durationSeconds);
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
      retention,
    );
    await this.liveState.setActiveUser(loaded.player1Id, loaded.id, retention);
    await this.liveState.setActiveUser(loaded.player2Id, loaded.id, retention);
  }

  /** House bot account, created lazily once per database (race-safe). */
  private botId: string | null = null;

  async ensureChallengeBot(): Promise<string> {
    if (this.botId) {
      return this.botId;
    }
    const existing = await this.prisma.user.findUnique({
      where: { email: BOT_EMAIL },
      select: { id: true },
    });
    if (existing) {
      this.botId = existing.id;
      return existing.id;
    }
    try {
      const created = await this.prisma.user.create({
        data: {
          email: BOT_EMAIL,
          username: 'apteez_bot',
          displayName: 'ApteeZ Bot',
          passwordHash: null,
          emailVerified: new Date(),
          isSystem: true,
        },
      });
      this.botId = created.id;
      return created.id;
    } catch {
      const winner = await this.prisma.user.findUniqueOrThrow({
        where: { email: BOT_EMAIL },
        select: { id: true },
      });
      this.botId = winner.id;
      return winner.id;
    }
  }

  private async selectQuestions(
    categoryId: string,
    targetRating: number,
    excludeProblemIds: string[],
    limit: number,
  ): Promise<string[]> {
    // Rating proximity is computed in SQL with a bounded LIMIT: loading the
    // whole category into Node per match does not scale past a few thousand
    // problems. The oversample factor preserves selection variety for the
    // Fisher-Yates shuffle below.
    const candidates = await this.prisma.$queryRaw<Array<{ id: string; rating: number }>>`
      SELECT "id", "rating" FROM "problems"
      WHERE "status" = 'PUBLISHED' AND "categoryId" = ${categoryId}::uuid
      ${excludeProblemIds.length > 0 ? Prisma.sql`AND "id"::text NOT IN (${Prisma.join(excludeProblemIds)})` : Prisma.empty}
      ORDER BY ABS("rating" - ${targetRating}) ASC
      LIMIT ${Math.max(limit * 4, 20)}`;
    if (candidates.length === 0) {
      return [];
    }
    const ranked = [...candidates];
    for (let i = ranked.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [ranked[i], ranked[j]] = [ranked[j]!, ranked[i]!];
    }
    return ranked.slice(0, limit).map((candidate) => candidate.id);
  }

  /**
   * Endless questions: appends the next batch when the player is close to the
   * end. Asked problems are excluded so nothing repeats until the pool is
   * exhausted; then only the most recent stay excluded. questionCount grows
   * with the match, so completion stays purely time-driven.
   */
  private async topUpQuestions(
    challengeId: string,
    answeredCount: number,
    knownTotal: number,
  ): Promise<boolean> {
    // Cheap gate first: no query at all unless the player is near the end.
    if (answeredCount < knownTotal - CHALLENGE_TOPUP_BUFFER) {
      return false;
    }
    return (
      (await this.lock.withLock(
        `challenge:questions:${challengeId}`,
        QUESTIONS_LOCK_TTL_MS,
        async () => {
          const rows = await this.prisma.challengeQuestion.findMany({
            where: { challengeId },
            select: { position: true, problemId: true },
            orderBy: { position: 'asc' },
          });
          if (answeredCount < rows.length - CHALLENGE_TOPUP_BUFFER) {
            return false;
          }
          const challenge = await this.prisma.challenge.findUniqueOrThrow({
            where: { id: challengeId },
            select: { categoryId: true, player1RatingSnapshot: true, player2RatingSnapshot: true },
          });
          const asked = rows.map((row) => row.problemId);
          const target = (challenge.player1RatingSnapshot + challenge.player2RatingSnapshot) / 2;
          let fresh = await this.selectQuestions(
            challenge.categoryId,
            target,
            asked,
            CHALLENGE_INITIAL_QUESTION_BATCH,
          );
          if (fresh.length === 0 && asked.length > 0) {
            // Small pool exhausted: recycle everything except the most recent.
            const recent = new Set(asked.slice(-3));
            fresh = await this.selectQuestions(
              challenge.categoryId,
              target,
              [...recent],
              CHALLENGE_INITIAL_QUESTION_BATCH,
            );
            if (fresh.length === 0) {
              return false;
            }
          } else if (fresh.length === 0) {
            return false;
          }
          const base = rows.length;
          await this.prisma.challengeQuestion.createMany({
            data: fresh.map((problemId, index) => ({
              challengeId,
              problemId,
              position: base + index,
            })),
            skipDuplicates: true,
          });
          const total = await this.prisma.challengeQuestion.count({ where: { challengeId } });
          await this.prisma.challenge.update({
            where: { id: challengeId },
            data: { questionCount: total },
          });
          this.logger.log(
            `challenge.topup id=${challengeId} +${fresh.length} total=${total}`,
            'Challenge',
          );
          return true;
        },
      )) ?? false
    );
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
      isSolo: row.isSolo,
      ratingStatus: row.ratingStatus,
      ratingAttempts: row.ratingAttempts,
      matchedAt: row.matchedAt,
      startedAt: row.startedAt,
      endsAt: row.endsAt,
      endedAt: row.endedAt,
      questions: row.questions,
      answeredByPlayer,
    };
  }

  /**
   * Promotes COUNTDOWN→LIVE and completes on timer expiry, based on the clock.
   *
   * Fair-clock rule: the 5s countdown is wall-clock from match creation, but
   * the LIVE snapshot (questions + signed URLs) can arrive late on a slow
   * database — and the 2s server tick can only promote the match after the
   * fact. Without compensation the player loses that lateness off their
   * playable time, or the expiry job fires on a match they never saw
   * ("time's up" with zero questions). So a late promotion shifts the whole
   * window forward by the lateness, capped at 30s (beyond that the expiry
   * and grace paths own the match). The TIMER_EXPIRED guard in runFinalize
   * and the re-check in the expiry processor keep the shifted clock
   * authoritative — nothing can finalize before it.
   */
  async syncStatus(challenge: LoadedChallenge): Promise<LoadedChallenge> {
    const now = Date.now();
    if (
      challenge.status === 'COUNTDOWN' &&
      challenge.startedAt &&
      now >= challenge.startedAt.getTime()
    ) {
      const latenessMs = Math.min(now - challenge.startedAt.getTime(), 30_000);
      const updated = await this.prisma.challenge.updateMany({
        where: { id: challenge.id, status: 'COUNTDOWN' },
        data: {
          status: 'LIVE',
          ...(latenessMs > 0
            ? {
                startedAt: new Date(challenge.startedAt.getTime() + latenessMs),
                endsAt: challenge.endsAt
                  ? new Date(challenge.endsAt.getTime() + latenessMs)
                  : undefined,
              }
            : {}),
        },
      });
      if (updated.count > 0) {
        challenge.status = 'LIVE';
        if (latenessMs > 0) {
          challenge.startedAt = new Date(challenge.startedAt.getTime() + latenessMs);
          if (challenge.endsAt) {
            challenge.endsAt = new Date(challenge.endsAt.getTime() + latenessMs);
          }
        }
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
    // Persisted duration wins over config defaults: env minutes may change
    // between match creation and later reads.
    const config = buildChallengeConfig(challenge.domainSlug, challenge.durationSeconds);

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
      isSolo: challenge.isSolo,
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
    // Hot cache: a timed match rebuilds the same few question views on every
    // tick and answer (each a multi-query round trip otherwise). Content is
    // effectively immutable mid-match; 60s TTL keeps admin edits converging.
    const cached = this.contentCache.get(problemId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.bundle;
    }
    if (this.contentCache.size > CONTENT_CACHE_MAX) {
      this.contentCache.clear();
    }
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
    const bundle: ContentBundle = {
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
    this.contentCache.set(problemId, { bundle, expiresAt: Date.now() + CONTENT_CACHE_TTL_MS });
    return bundle;
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
    const opponentId = userId === challenge.player1Id ? challenge.player2Id : challenge.player1Id;
    const existing = selfAnswers.get(input.position);
    if (existing) {
      const next = await this.buildQuestionView(challenge, currentPosition, selfAnswers);
      return {
        accepted: true,
        position: input.position,
        answeredCount: selfAnswers.size,
        nextQuestion: next,
        selfScoreboard: this.scoreboardFrom(selfAnswers, challenge.questionCount),
        selfProgress: this.opponentProgressFor(challenge, userId),
        opponentProgress: this.opponentProgressFor(challenge, opponentId),
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
    let duplicate = false;
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
      duplicate = true;
    }

    // Fresh counts WITHOUT a second full load: mine grew by one (or was
    // already there on duplicate), the opponent is untouched by this call.
    const opponentAnswers = challenge.answeredByPlayer.get(
      userId === challenge.player1Id ? challenge.player2Id : challenge.player1Id,
    );
    const mineCount = selfAnswers.size + (duplicate ? 0 : 1);
    const oppCount = opponentAnswers?.size ?? 0;
    const bothDone =
      !challenge.isSolo &&
      mineCount >= challenge.questionCount &&
      oppCount >= challenge.questionCount;
    if (bothDone) {
      await this.finalizeOnce(challenge.id, 'COMPLETED');
    } else if (!isTerminal(challenge.status)) {
      // Endless top-up so the next question always exists before the clock.
      await this.topUpQuestions(challenge.id, mineCount, challenge.questionCount);
    }
    // The list only grows inside topUpQuestions; reload solely then, so the
    // hot path stays at ONE full challenge load instead of three.
    const grown = !bothDone && mineCount >= challenge.questionCount - CHALLENGE_TOPUP_BUFFER;
    const live = grown ? await this.loadChallenge(challenge.id) : challenge;
    const liveMap = duplicate
      ? (live.answeredByPlayer.get(userId) ?? selfAnswers)
      : new Map([
          ...selfAnswers,
          [input.position, { optionId: option.id, isCorrect: option.isCorrect, answeredAt: now }],
        ]);
    const nextPosition = liveMap.size;
    const next =
      nextPosition < live.questionCount
        ? await this.buildQuestionView(live, nextPosition, liveMap)
        : null;
    return {
      accepted: true,
      position: input.position,
      answeredCount: liveMap.size,
      nextQuestion: next,
      selfScoreboard: this.scoreboardFrom(liveMap, live.questionCount),
      selfProgress: this.opponentProgressFor(live, userId),
      opponentProgress: this.opponentProgressFor(
        live,
        userId === live.player1Id ? live.player2Id : live.player1Id,
      ),
    };
  }

  /**
   * Cheap match-found preview for the instant MATCHED push: one row, no
   * questions/answers/content, so the countdown UI starts on time even while
   * the full state snapshot is still loading on a slow database.
   */
  async matchPreview(challengeId: string): Promise<{
    challengeId: string;
    domainSlug: string;
    domainName: string;
    countdownEndsAt: string | null;
    serverTime: string;
    isSolo: boolean;
    player1Id: string;
    player2Id: string;
    player1DisplayName: string;
    player2DisplayName: string;
    player1RatingSnapshot: number;
    player2RatingSnapshot: number;
  } | null> {
    const row = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      select: {
        id: true,
        domainSlug: true,
        category: { select: { name: true } },
        startedAt: true,
        isSolo: true,
        player1Id: true,
        player2Id: true,
        player1: { select: { displayName: true } },
        player2: { select: { displayName: true } },
        player1RatingSnapshot: true,
        player2RatingSnapshot: true,
      },
    });
    if (!row) {
      return null;
    }
    return {
      challengeId: row.id,
      domainSlug: row.domainSlug,
      domainName: row.category.name,
      countdownEndsAt: row.startedAt?.toISOString() ?? null,
      serverTime: new Date().toISOString(),
      isSolo: row.isSolo,
      player1Id: row.player1Id,
      player2Id: row.player2Id,
      player1DisplayName: row.player1.displayName,
      player2DisplayName: row.player2.displayName,
      player1RatingSnapshot: row.player1RatingSnapshot,
      player2RatingSnapshot: row.player2RatingSnapshot,
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
    // The expiry job is scheduled at match creation while the fair-clock
    // shift in syncStatus can move endsAt forward: a stale job (or a tick
    // racing a just-shifted clock) must never finalize a match that still
    // has time left. Other reasons (all-answered, abandon, cancel) always
    // proceed — this guard is only about the wall clock.
    if (reason === 'TIMER_EXPIRED' && challenge.status === 'LIVE' && challenge.endsAt) {
      if (Date.now() < challenge.endsAt.getTime() - 2000) {
        this.logger.warn(
          `challenge.finalize.skipped-early id=${challengeId} endsAt=${challenge.endsAt.toISOString()}`,
          'Challenge',
        );
        return;
      }
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
    // Runs once per finalized challenge (the claim above is the idempotency
    // gate), so replayed jobs never double-count completion.
    const scoringIds = challenge.isSolo
      ? [challenge.player1Id]
      : [challenge.player1Id, challenge.player2Id];
    for (const playerId of scoringIds) {
      void this.analytics.record('challenge.completed', {
        userId: playerId,
        metadata: { challengeId, outcome },
      });
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
    if (challenge.isSolo) {
      // Solo runs are unrated by design: mark the rating step complete with
      // no history rows so the client stops polling for a change.
      await this.prisma.challenge.update({
        where: { id: challengeId },
        data: { ratingStatus: 'COMPLETED', ratingProcessedAt: new Date() },
      });
      if (data.status === 'COMPLETED') {
        void this.points
          .awardTrigger({
            userId: challenge.player1Id,
            trigger: 'challenge-complete',
            sourceType: 'challenge',
            sourceId: challengeId,
          })
          .catch(() => undefined);
      }
      this.logger.log(`challenge.solo-finalized id=${challengeId} outcome=${outcome}`, 'Challenge');
      return;
    }
    // Only a genuinely completed match moves ratings. Enqueue the (idempotent)
    // rating job after the challenge is durably finalized, so a rating failure
    // never rolls back the result.
    if (data.status === 'COMPLETED') {
      await this.queue.enqueueRatingUpdate(challengeId);
      // Activity reward for both players. Best-effort: failures never roll
      // back the result, and per-challenge source uniqueness prevents doubles.
      for (const playerId of [challenge.player1Id, challenge.player2Id]) {
        void this.points
          .awardTrigger({
            userId: playerId,
            trigger: 'challenge-complete',
            sourceType: 'challenge',
            sourceId: challengeId,
          })
          .catch(() => undefined);
      }
    }
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
    // Leaving a LIVE match is a forfeit (ABANDONED with a recorded winner),
    // never a CANCELLED no-result: the state machine allows CANCELLED only
    // before LIVE, and a unilateral cancel must not erase a live game.
    if (challenge.status === 'LIVE') {
      await this.finalizeOnce(challengeId, 'ABANDONED', userId);
      return;
    }
    await this.finalizeOnce(challengeId, 'CANCELLED');
  }

  async buildResult(challengeId: string, userId: string): Promise<ChallengeResultDto> {
    const challenge = await this.loadChallenge(challengeId);
    this.assertMember(challenge, userId);
    // Self-heal a stuck rating step before reading: on the free tier the
    // BullMQ worker/Redis can lag or drop the job, which used to leave the
    // client on "rating is being processed…" forever. processChallenge is
    // idempotent + lock-guarded, so concurrent readers serialize harmlessly.
    const ratingSettled = await this.ensureRatingSettled(challenge);
    const ratingStatus = ratingSettled
      ? ((
          await this.prisma.challenge.findUnique({
            where: { id: challengeId },
            select: { ratingStatus: true },
          })
        )?.ratingStatus ?? challenge.ratingStatus)
      : challenge.ratingStatus;
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
      isSolo: challenge.isSolo,
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
      ratingStatus,
    };
  }

  /**
   * Manual rating retry for a stuck challenge. Resets the attempt counter
   * (the poison guard would otherwise dead-end after 5 failures) and runs
   * processing synchronously, then returns the fresh result. Never throws
   * for a processing failure — the returned payload carries the honest
   * status instead.
   */
  async retryRating(challengeId: string, userId: string): Promise<ChallengeResultDto> {
    const challenge = await this.loadChallenge(challengeId);
    this.assertMember(challenge, userId);
    if (challenge.isSolo) {
      throw new ChallengeStateError('Solo runs are unrated.');
    }
    if (challenge.status !== 'COMPLETED') {
      throw new ChallengeStateError('Only completed challenges can be rated.');
    }
    if (challenge.ratingStatus !== 'COMPLETED') {
      await this.prisma.challenge.update({
        where: { id: challengeId },
        data: { ratingStatus: 'PENDING', ratingAttempts: 0 },
      });
      try {
        await this.ratings.processChallenge(challengeId);
      } catch (error) {
        this.logger.warn(
          `challenge.rating.retry-failed id=${challengeId} ${error instanceof Error ? error.message : String(error)}`,
          'Challenge',
        );
      }
    }
    return this.buildResult(challengeId, userId);
  }

  /**
   * Best-effort synchronous rating catch-up for result reads. Returns true
   * when a processing attempt was made (caller re-reads the status scalar).
   * Never throws: a failure keeps the persisted result intact and the client
   * keeps polling/retrying.
   */
  private async ensureRatingSettled(challenge: LoadedChallenge): Promise<boolean> {
    if (challenge.isSolo) {
      return false;
    }
    if (challenge.status !== 'COMPLETED' || challenge.ratingStatus === 'COMPLETED') {
      return false;
    }
    // Poison guard: after repeated failures the row needs human attention,
    // not another hot-loop attempt on every result read.
    if (challenge.ratingAttempts >= 5) {
      return false;
    }
    // Give a just-enqueued BullMQ job a grace window before duplicating its
    // work — the lock would serialize anyway, but this avoids needless load.
    if (challenge.ratingStatus === 'PROCESSING' && challenge.endedAt) {
      if (Date.now() - challenge.endedAt.getTime() < 30_000) {
        return false;
      }
    }
    try {
      await this.ratings.processChallenge(challenge.id);
      return true;
    } catch (error) {
      this.logger.warn(
        `challenge.rating.self-heal-failed id=${challenge.id} ${error instanceof Error ? error.message : String(error)}`,
        'Challenge',
      );
      return false;
    }
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

  /**
   * Offset-paginated match history, newest first. Finalized rows are
   * immutable, so skip/take stays consistent while remaining cheap (one
   * count + one page query in parallel, one batched rating lookup).
   */
  async history(
    userId: string,
    query: ChallengeHistoryQuery,
  ): Promise<OffsetPage<ChallengeHistoryEntryDto>> {
    const where: Prisma.ChallengeWhereInput = {
      status: { in: ['COMPLETED', 'ABANDONED', 'EXPIRED', 'CANCELLED'] },
      OR: [{ player1Id: userId }, { player2Id: userId }],
      ...(query.domain ? { domainSlug: query.domain } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.challenge.count({ where }),
      this.prisma.challenge.findMany({
        where,
        orderBy: [{ endedAt: 'desc' }, { id: 'desc' }],
        skip: query.offset,
        take: query.limit,
        select: {
          id: true,
          domainSlug: true,
          outcome: true,
          completionReason: true,
          winnerId: true,
          isSolo: true,
          player1Id: true,
          player2Id: true,
          player1Score: true,
          player2Score: true,
          endedAt: true,
          createdAt: true,
          durationSeconds: true,
          category: { select: { name: true } },
          player1: { select: { id: true, username: true, displayName: true, avatarKey: true } },
          player2: { select: { id: true, username: true, displayName: true, avatarKey: true } },
        },
      }),
    ]);
    const ratingByMatch = await this.ratings.changesForMany(
      rows.map((row) => row.id),
      userId,
    );
    const items: ChallengeHistoryEntryDto[] = rows.map((row) => {
      const isPlayer1 = row.player1Id === userId;
      const opponent = isPlayer1 ? row.player2 : row.player1;
      return {
        id: row.id,
        domainSlug: row.domainSlug,
        domainName: row.category.name,
        outcome: row.outcome ?? 'CANCELLED',
        completionReason: row.completionReason ?? 'CANCELLED',
        result: row.winnerId === null ? 'DRAW' : row.winnerId === userId ? 'WIN' : 'LOSS',
        isSolo: row.isSolo,
        selfScore: (isPlayer1 ? row.player1Score : row.player2Score) ?? 0,
        opponentScore: (isPlayer1 ? row.player2Score : row.player1Score) ?? 0,
        ratingChange: ratingByMatch.get(row.id) ?? null,
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
    return {
      items,
      total,
      offset: query.offset,
      limit: query.limit,
      hasMore: query.offset + items.length < total,
    };
  }

  /**
   * One-shot analytics for the history header: outcome split from the
   * challenge rows plus self-side score aggregates in a single raw query
   * (two round trips total, regardless of match count).
   */
  async historyStats(
    userId: string,
    query: ChallengeHistoryStatsQuery,
  ): Promise<ChallengeHistoryStatsDto> {
    const where: Prisma.ChallengeWhereInput = {
      status: { in: ['COMPLETED', 'ABANDONED'] },
      OR: [{ player1Id: userId }, { player2Id: userId }],
      ...(query.domain ? { domainSlug: query.domain } : {}),
    };
    const [draws, wins, scores] = await Promise.all([
      this.prisma.challenge.count({ where: { ...where, outcome: 'DRAW' } }),
      this.prisma.challenge.count({ where: { ...where, winnerId: userId } }),
      this.prisma.$queryRaw<
        Array<{
          matches: number;
          total_score: number | null;
          best_score: number | null;
          total_correct: number | null;
          total_wrong: number | null;
        }>
      >`
        SELECT COUNT(*)::int AS matches,
          SUM(CASE WHEN "player1Id" = ${userId}::uuid THEN COALESCE("player1Score", 0) ELSE COALESCE("player2Score", 0) END)::int AS total_score,
          MAX(CASE WHEN "player1Id" = ${userId}::uuid THEN COALESCE("player1Score", 0) ELSE COALESCE("player2Score", 0) END)::int AS best_score,
          SUM(CASE WHEN "player1Id" = ${userId}::uuid THEN COALESCE("player1Correct", 0) ELSE COALESCE("player2Correct", 0) END)::int AS total_correct,
          SUM(CASE WHEN "player1Id" = ${userId}::uuid THEN COALESCE("player1Wrong", 0) ELSE COALESCE("player2Wrong", 0) END)::int AS total_wrong
        FROM "challenges"
        WHERE "status" IN ('COMPLETED', 'ABANDONED')
          AND ("player1Id" = ${userId}::uuid OR "player2Id" = ${userId}::uuid)
          ${query.domain ? Prisma.sql`AND "domainSlug" = ${query.domain}` : Prisma.empty}`,
    ]);
    const aggregate = scores[0];
    const matches = aggregate?.matches ?? 0;
    const losses = Math.max(0, matches - wins - draws);
    const totalScore = aggregate?.total_score ?? 0;
    return {
      domainSlug: query.domain ?? null,
      matches,
      wins,
      losses,
      draws,
      winRate: matches > 0 ? Math.round((wins / matches) * 1000) / 10 : 0,
      bestScore: aggregate?.best_score ?? null,
      avgScore: matches > 0 ? Math.round((totalScore / matches) * 10) / 10 : null,
      totalCorrect: aggregate?.total_correct ?? 0,
      totalWrong: aggregate?.total_wrong ?? 0,
    };
  }

  /** Opponent id for a member, or null for strangers (one tiny select). */
  async opponentIdOf(challengeId: string, userId: string): Promise<string | null> {
    const row = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      select: { player1Id: true, player2Id: true },
    });
    if (!row) {
      return null;
    }
    if (row.player1Id === userId) {
      return row.player2Id;
    }
    if (row.player2Id === userId) {
      return row.player1Id;
    }
    return null;
  }

  /** Terminal check without loading questions/answers/content. */
  async isTerminalStatus(challengeId: string): Promise<boolean> {
    const row = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      select: { status: true },
    });
    return row ? isTerminal(row.status) : true;
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
