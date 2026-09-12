import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@apteez/database';
import type { ContestDetailDto, ContestSessionDto, ContestSummaryDto } from '@apteez/types';
import type { ContestListQuery } from '@apteez/validation';
import { AppLogger } from '../../common/logger/app-logger';
import { RedisLockService } from '../../redis/redis-lock.service';
import { StorageService } from '../../storage/storage.service';
import { ContestNotFoundError } from './contest.errors';
import { ContestRepository } from './contest.repository';
import { ContestRatingCalculator } from './contest-rating.calculator';

export interface ContestRow {
  id: string;
  title: string;
  description: string | null;
  rules: string | null;
  status: ContestSummaryDto['status'];
  difficulty: ContestSummaryDto['difficulty'];
  startsAt: Date;
  endsAt: Date;
  durationSeconds: number;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  maxParticipants: number | null;
  questionCount: number;
  scoringModel: 'SOLVED_COUNT';
  resultVisibility: ContestDetailDto['resultVisibility'];
  revealAnswersLive: boolean;
  createdById: string | null;
  createdBy: { displayName: string } | null;
  _count: { participants: number };
  ratingStatus: string;
}

export interface ParticipantRow {
  id: string;
  contestId: string;
  userId: string;
  status: ContestSessionDto['participantStatus'];
  ratingBefore: number | null;
  startedAt: Date | null;
  effectiveEndAt: Date | null;
  submittedAt: Date | null;
  currentPosition: number;
}

export interface QuestionRow {
  id: string;
  contestId: string;
  position: number;
  points: number;
  problem: {
    id: string;
    title: string;
    statement: string | null;
    contentMode: 'TEXT_ONLY' | 'IMAGE_ONLY' | 'TEXT_AND_IMAGE';
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    explanation: string | null;
    shortcut: string | null;
    assets: Array<{
      id: string;
      kind: 'QUESTION_IMAGE' | 'EXPLANATION_IMAGE' | 'OTHER';
      objectKey: string;
      mimeType: string;
      position: number;
      altText: string | null;
    }>;
    options: Array<{
      id: string;
      position: number;
      text: string | null;
      assetKey: string | null;
      isCorrect: boolean;
    }>;
  };
}

import { AuthRequiredError } from '../auth/auth.errors';
import {
  ContestExpiredError,
  ContestNotRegisteredError,
  ContestQuestionError,
  ContestRegistrationError,
  ContestStateError,
} from './contest.errors';
import { DEFAULT_CONTEST_RATING } from './contest-rating.calculator';
import { compareContestResults, contestScoreFor } from './contest.util';
import type {
  ContestLeaderboardEntryDto,
  ContestNavigatorItemDto,
  ContestQuestionViewDto,
  ContestResultDto,
  ContestSubmitPreviewDto,
  ContestUpsolveDto,
  PaginatedData,
} from '@apteez/types';
import type {
  ContestAnswerInput,
  ContestLeaderboardQuery,
  ContestReviewInput,
  ContestSuspiciousEventInput,
} from '@apteez/validation';

const FINALIZE_LOCK_TTL_MS = 10_000;
const CLOSE_LOCK_TTL_MS = 30_000;

/** Server-authoritative contest engine; clients never supply competitive values. */
@Injectable()
export class ContestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ContestRepository,
    private readonly ratings: ContestRatingCalculator,
    private readonly lock: RedisLockService,
    private readonly storage: StorageService,
    private readonly logger: AppLogger,
  ) {}

  async list(query: ContestListQuery, userId?: string): Promise<PaginatedData<ContestSummaryDto>> {
    const where: Prisma.ContestWhereInput = {
      status: { in: ['PUBLISHED', 'REGISTRATION_OPEN', 'LIVE', 'ENDED', 'ARCHIVED'] },
    };
    if (query.difficulty) {
      where.difficulty = query.difficulty;
    }
    if (query.phase === 'live') {
      where.status = 'LIVE';
    } else if (query.phase === 'upcoming') {
      where.status = { in: ['PUBLISHED', 'REGISTRATION_OPEN'] };
    } else if (query.phase === 'past') {
      where.status = { in: ['ENDED', 'ARCHIVED'] };
    } else if (query.phase === 'active') {
      where.OR = [{ status: 'LIVE' }, { status: 'REGISTRATION_OPEN' }];
    }
    const total = await this.prisma.contest.count({ where });
    const rows = (await this.prisma.contest.findMany({
      where,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        createdBy: { select: { displayName: true } },
        _count: { select: { participants: true } },
      },
    })) as ContestRow[];
    const registered = await this.registeredSet(
      rows.map((r) => r.id),
      userId,
    );
    return {
      items: rows.map((row) => this.toSummary(row, registered.has(row.id))),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async detail(contestId: string, userId?: string): Promise<ContestDetailDto> {
    const contest = await this.requireContest(contestId);
    if (contest.status === 'DRAFT' || contest.status === 'CANCELLED') {
      throw new ContestNotFoundError();
    }
    const participant = userId ? await this.findParticipant(contestId, userId) : null;
    return {
      ...this.toSummary(contest, Boolean(participant)),
      rules: contest.rules,
      scoringModel: contest.scoringModel,
      resultVisibility: contest.resultVisibility,
      revealAnswersLive: contest.revealAnswersLive,
      participant: participant
        ? {
            status: participant.status,
            startedAt: participant.startedAt?.toISOString() ?? null,
            effectiveEndAt: participant.effectiveEndAt?.toISOString() ?? null,
            submittedAt: participant.submittedAt?.toISOString() ?? null,
            currentPosition: participant.currentPosition,
          }
        : null,
    };
  }

  async register(contestId: string, userId: string) {
    const contest = await this.requireContest(contestId);
    this.assertRegistrationOpen(contest);
    const existing = await this.findParticipant(contestId, userId);
    if (existing) {
      return { registered: true, status: existing.status };
    }
    if (contest.maxParticipants !== null) {
      const count = await this.prisma.contestParticipant.count({ where: { contestId } });
      if (count >= contest.maxParticipants) {
        throw new ContestRegistrationError('This contest is full.');
      }
    }
    try {
      await this.prisma.contestParticipant.create({
        data: { contestId, userId, status: 'REGISTERED' },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return { registered: true, status: 'REGISTERED' };
      }
      throw error;
    }
    return { registered: true, status: 'REGISTERED' };
  }

  async unregister(contestId: string, userId: string) {
    const participant = await this.findParticipant(contestId, userId);
    if (!participant) {
      return { registered: false };
    }
    if (participant.status !== 'REGISTERED') {
      throw new ContestStateError('You can only withdraw before entering the contest.');
    }
    await this.prisma.contestParticipant.delete({ where: { id: participant.id } });
    return { registered: false };
  }

  async start(contestId: string, userId: string): Promise<ContestSessionDto> {
    const contest = await this.requireContest(contestId);
    this.assertParticipable(contest);
    const participant = await this.requireParticipant(contestId, userId);
    const now = new Date();
    if (now >= contest.endsAt) {
      await this.finalizeParticipant(contestId, userId, true);
      throw new ContestExpiredError();
    }
    if (!participant.startedAt || !participant.effectiveEndAt) {
      const effectiveEndAt = new Date(
        Math.min(contest.endsAt.getTime(), now.getTime() + contest.durationSeconds * 1000),
      );
      const rating = await this.repo.ensureContestRating(userId);
      await this.prisma.contestParticipant.update({
        where: { id: participant.id },
        data: {
          status: 'ACTIVE',
          startedAt: now,
          effectiveEndAt,
          lastSeenAt: now,
          ratingBefore: participant.ratingBefore ?? rating.rating,
        },
      });
    } else {
      await this.prisma.contestParticipant.update({
        where: { id: participant.id },
        data: {
          status: participant.status === 'REGISTERED' ? 'ACTIVE' : undefined,
          lastSeenAt: now,
        },
      });
    }
    return this.session(contestId, userId);
  }

  async session(contestId: string, userId: string): Promise<ContestSessionDto> {
    const contest = await this.requireContest(contestId);
    const participant = await this.requireParticipant(contestId, userId);
    if (!participant.startedAt || !participant.effectiveEndAt) {
      throw new ContestNotRegisteredError('Enter the contest to start your session.');
    }
    const now = new Date();
    if (
      participant.status === 'ACTIVE' &&
      (now >= participant.effectiveEndAt || now >= contest.endsAt)
    ) {
      await this.finalizeParticipant(contestId, userId, true);
      return this.session(contestId, userId);
    }
    await this.prisma.contestParticipant.update({
      where: { id: participant.id },
      data: { lastSeenAt: now },
    });
    const questions = await this.loadQuestions(contestId);
    const answers = await this.prisma.contestAnswer.findMany({
      where: { participantId: participant.id },
      select: { contestQuestionId: true, selectedOptionId: true, markedForReview: true },
    });
    const byQuestion = new Map(answers.map((a) => [a.contestQuestionId, a]));
    const currentPosition = Math.min(
      Math.max(0, participant.currentPosition),
      Math.max(0, questions.length - 1),
    );
    const finalized = participant.status === 'SUBMITTED' || participant.status === 'AUTO_SUBMITTED';
    const reveal = finalized || contest.revealAnswersLive;
    const urls = await this.resolveOptionUrls(questions);
    const items: ContestNavigatorItemDto[] = questions.map((q, index) => {
      const answer = byQuestion.get(q.id);
      let state: ContestNavigatorItemDto['state'] = 'unanswered';
      if (index === currentPosition) {
        state = 'current';
      } else if (answer?.markedForReview) {
        state = 'review';
      } else if (answer?.selectedOptionId) {
        state = 'answered';
      }
      const item: ContestNavigatorItemDto = { position: q.position, questionId: q.id, state };
      if (reveal) {
        const correct = q.problem.options.find((o) => o.isCorrect);
        const selected = answer?.selectedOptionId ?? null;
        item.correctness =
          selected === null ? 'unanswered' : selected === correct?.id ? 'correct' : 'incorrect';
      }
      return item;
    });
    const answeredCount = answers.filter((a) => a.selectedOptionId).length;
    const reviewCount = answers.filter((a) => a.markedForReview).length;
    const current = await this.toQuestionView(
      questions[currentPosition]!,
      byQuestion.get(questions[currentPosition]!.id) ?? null,
      {
        answerable: !finalized && now < participant.effectiveEndAt! && now < contest.endsAt,
        reveal,
      },
      urls,
    );
    const remaining = finalized
      ? 0
      : Math.max(
          0,
          Math.ceil(
            (Math.min(participant.effectiveEndAt!.getTime(), contest.endsAt.getTime()) -
              now.getTime()) /
              1000,
          ),
        );
    const refreshed = await this.findParticipant(contestId, userId);
    return {
      contestId,
      status: contest.status,
      participantStatus: refreshed?.status ?? participant.status,
      serverTime: now.toISOString(),
      startsAt: contest.startsAt.toISOString(),
      endsAt: contest.endsAt.toISOString(),
      startedAt: participant.startedAt.toISOString(),
      effectiveEndAt: participant.effectiveEndAt.toISOString(),
      remainingSeconds: remaining,
      submittedAt: participant.submittedAt?.toISOString() ?? null,
      currentPosition,
      totalQuestions: questions.length,
      answeredCount,
      unansweredCount: Math.max(0, questions.length - answeredCount),
      reviewCount,
      questions: items,
      current,
    };
  }

  async answer(contestId: string, questionId: string, userId: string, input: ContestAnswerInput) {
    const guard = await this.requireAnswerable(contestId, userId, questionId);
    const option = guard.question.problem.options.find((o) => o.id === input.selectedOptionId);
    if (!option) {
      throw new ContestQuestionError('That option does not belong to this question.');
    }
    await this.prisma.contestAnswer.upsert({
      where: {
        contestQuestionId_participantId: {
          contestQuestionId: guard.question.id,
          participantId: guard.participant.id,
        },
      },
      update: { selectedOptionId: input.selectedOptionId, answeredAt: new Date() },
      create: {
        contestId,
        participantId: guard.participant.id,
        contestQuestionId: guard.question.id,
        userId,
        selectedOptionId: input.selectedOptionId,
        answeredAt: new Date(),
      },
    });
    if (input.currentPosition !== undefined) {
      await this.prisma.contestParticipant.update({
        where: { id: guard.participant.id },
        data: { currentPosition: input.currentPosition, lastSeenAt: new Date() },
      });
    }
    return this.answerCounts(guard.participant.id);
  }

  async review(contestId: string, questionId: string, userId: string, input: ContestReviewInput) {
    const guard = await this.requireAnswerable(contestId, userId, questionId);
    await this.prisma.contestAnswer.upsert({
      where: {
        contestQuestionId_participantId: {
          contestQuestionId: guard.question.id,
          participantId: guard.participant.id,
        },
      },
      update: { markedForReview: input.markedForReview },
      create: {
        contestId,
        participantId: guard.participant.id,
        contestQuestionId: guard.question.id,
        userId,
        selectedOptionId: null,
        markedForReview: input.markedForReview,
      },
    });
    if (input.currentPosition !== undefined) {
      await this.prisma.contestParticipant.update({
        where: { id: guard.participant.id },
        data: { currentPosition: input.currentPosition, lastSeenAt: new Date() },
      });
    }
    return this.answerCounts(guard.participant.id);
  }

  async submitPreview(contestId: string, userId: string): Promise<ContestSubmitPreviewDto> {
    const participant = await this.requireParticipant(contestId, userId);
    const totalQuestions = await this.prisma.contestQuestion.count({ where: { contestId } });
    const counts = await this.answerCounts(participant.id);
    return {
      answeredCount: counts.answeredCount,
      unansweredCount: Math.max(0, totalQuestions - counts.answeredCount),
      reviewCount: counts.reviewCount,
      totalQuestions,
    };
  }

  async submit(contestId: string, userId: string): Promise<ContestResultDto> {
    return this.finalizeParticipant(contestId, userId, false);
  }

  async expireParticipant(contestId: string, userId: string): Promise<ContestResultDto> {
    return this.finalizeParticipant(contestId, userId, true);
  }

  async sweepExpired(contestId: string): Promise<number> {
    const now = new Date();
    const contest = await this.requireContest(contestId);
    const expired = await this.prisma.contestParticipant.findMany({
      where: {
        contestId,
        status: 'ACTIVE',
        OR: [
          { effectiveEndAt: { lte: now } },
          ...(now >= contest.endsAt ? [{ startedAt: { not: null } }] : []),
        ],
      },
      select: { userId: true },
      take: 500,
    });
    let finalized = 0;
    for (const row of expired) {
      try {
        await this.finalizeParticipant(contestId, row.userId, true);
        finalized += 1;
      } catch (error) {
        this.logger.warn(
          `contest.sweep-failed contest=${contestId} ${error instanceof Error ? error.message : String(error)}`,
          'Contest',
        );
      }
    }
    return finalized;
  }

  async result(contestId: string, userId: string): Promise<ContestResultDto> {
    const participant = await this.requireParticipant(contestId, userId);
    const existing = await this.prisma.contestResult.findUnique({
      where: { participantId: participant.id },
    });
    if (!existing) {
      throw new ContestStateError('Your contest has not been finalized yet.');
    }
    return this.toResult(contestId, participant, existing);
  }

  async leaderboard(
    contestId: string,
    query: ContestLeaderboardQuery,
    userId?: string,
  ): Promise<PaginatedData<ContestLeaderboardEntryDto>> {
    const contest = await this.requireContest(contestId);
    const now = new Date();
    const live = now < contest.endsAt && contest.status === 'LIVE';
    const total = await this.prisma.contestResult.count({ where: { contestId } });
    const rows = await this.prisma.contestResult.findMany({
      where: { contestId },
      orderBy: [{ score: 'desc' }, { completionSeconds: 'asc' }, { userId: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        user: { select: { username: true, displayName: true, avatarKey: true, institution: true } },
      },
    });
    const offset = (query.page - 1) * query.pageSize;
    return {
      items: rows.map((row, index) => ({
        rank: row.rank ?? offset + index + 1,
        userId: row.userId,
        username: live ? null : (row.user.username ?? null),
        displayName: live ? `Participant ${offset + index + 1}` : row.user.displayName,
        avatarKey: live ? null : row.user.avatarKey,
        institution: live ? null : (row.user.institution ?? null),
        solvedCount: row.solvedCount,
        score: row.score,
        wrongCount: row.wrongCount,
        completionSeconds: row.completionSeconds,
        isCurrentUser: userId ? row.userId === userId : false,
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async upsolve(contestId: string, userId: string): Promise<ContestUpsolveDto> {
    const contest = await this.requireContest(contestId);
    if (
      contest.status !== 'ENDED' &&
      contest.status !== 'ARCHIVED' &&
      new Date() < contest.endsAt
    ) {
      throw new ContestStateError('Upsolve opens after the contest ends.');
    }
    const participant = await this.requireParticipant(contestId, userId);
    const questions = await this.loadQuestions(contestId);
    const answers = await this.prisma.contestAnswer.findMany({
      where: { participantId: participant.id },
      select: { contestQuestionId: true, selectedOptionId: true, markedForReview: true },
    });
    const byQuestion = new Map(answers.map((a) => [a.contestQuestionId, a]));
    const urls = await this.resolveOptionUrls(questions);
    const items = await Promise.all(
      questions.map(async (q) => {
        const answer = byQuestion.get(q.id) ?? null;
        const view = await this.toQuestionView(
          q,
          answer,
          { answerable: false, reveal: true },
          urls,
        );
        const correct = q.problem.options.find((o) => o.isCorrect);
        const correctness = !answer?.selectedOptionId
          ? 'unanswered'
          : answer.selectedOptionId === correct?.id
            ? 'correct'
            : 'incorrect';
        return {
          ...view,
          correctness: correctness as 'correct' | 'incorrect' | 'unanswered',
          selectedOptionId: answer?.selectedOptionId ?? null,
        };
      }),
    );
    let result: ContestResultDto | null = null;
    const existing = await this.prisma.contestResult.findUnique({
      where: { participantId: participant.id },
    });
    if (existing) {
      result = await this.toResult(contestId, participant, existing);
    }
    return { contestId, result, questions: items };
  }

  async reportEvent(contestId: string, userId: string, input: ContestSuspiciousEventInput) {
    const participant = await this.requireParticipant(contestId, userId);
    await this.prisma.contestSuspiciousEvent.create({
      data: {
        contestId,
        participantId: participant.id,
        userId,
        type: input.type,
        detail: input.detail ?? null,
      },
    });
    return { recorded: true };
  }

  async closeContest(contestId: string) {
    const locked = await this.lock.withLock(
      `contest:close:${contestId}`,
      CLOSE_LOCK_TTL_MS,
      async () => this.runClose(contestId),
    );
    return locked ?? { ranked: 0, ratingsApplied: false };
  }

  async myRating(userId: string) {
    const row = await this.repo.ensureContestRating(userId);
    const full = await this.prisma.contestRating.findUniqueOrThrow({
      where: { userId: row.userId },
    });
    return { rating: full.rating, contestsPlayed: full.contestsPlayed, bestRank: full.bestRank };
  }

  private async runClose(contestId: string) {
    const ranked = await this.assignRanks(contestId);
    let ratingsApplied = false;
    try {
      ratingsApplied = await this.processRatings(contestId);
    } catch (error) {
      this.logger.warn(
        `contest.rating-failed contest=${contestId} ${error instanceof Error ? error.message : String(error)}`,
        'Contest',
      );
      await this.prisma.contest
        .update({ where: { id: contestId }, data: { ratingStatus: 'FAILED' } })
        .catch(() => undefined);
    }
    return { ranked, ratingsApplied };
  }

  private async finalizeParticipant(
    contestId: string,
    userId: string,
    auto: boolean,
  ): Promise<ContestResultDto> {
    const locked = await this.lock.withLock(
      `contest:finalize:${contestId}:${userId}`,
      FINALIZE_LOCK_TTL_MS,
      async () => this.runFinalize(contestId, userId, auto),
    );
    if (!locked) {
      const participant = await this.requireParticipant(contestId, userId);
      const existing = await this.prisma.contestResult.findUnique({
        where: { participantId: participant.id },
      });
      if (!existing) {
        throw new ContestStateError('Finalization is already in progress. Try again shortly.');
      }
      return this.toResult(contestId, participant, existing);
    }
    return locked;
  }

  private async runFinalize(
    contestId: string,
    userId: string,
    auto: boolean,
  ): Promise<ContestResultDto> {
    await this.requireContest(contestId);
    const participant = await this.requireParticipant(contestId, userId);
    const existing = await this.prisma.contestResult.findUnique({
      where: { participantId: participant.id },
    });
    if (existing) {
      return this.toResult(contestId, participant, existing);
    }
    if (participant.status === 'SUBMITTED' || participant.status === 'AUTO_SUBMITTED') {
      throw new ContestStateError('This contest was already submitted.');
    }
    const now = new Date();
    const startedAt = participant.startedAt ?? now;
    const completionSeconds = Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 1000));
    const questions = await this.loadQuestions(contestId);
    const answers = await this.prisma.contestAnswer.findMany({
      where: { participantId: participant.id },
      select: { contestQuestionId: true, selectedOptionId: true },
    });
    const selected = new Map(answers.map((a) => [a.contestQuestionId, a.selectedOptionId]));
    let solved = 0;
    let wrong = 0;
    const correctness = new Map<string, boolean | null>();
    for (const q of questions) {
      const correct = q.problem.options.find((o) => o.isCorrect);
      const pick = selected.get(q.id) ?? null;
      if (!pick) {
        correctness.set(q.id, null);
        continue;
      }
      const ok = correct ? pick === correct.id : false;
      correctness.set(q.id, ok);
      if (ok) {
        solved += 1;
      } else {
        wrong += 1;
      }
    }
    const unanswered = Math.max(0, questions.length - solved - wrong);
    const score = contestScoreFor(solved);
    const status = auto ? 'AUTO_SUBMITTED' : 'SUBMITTED';
    let result;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        await tx.contestParticipant.update({
          where: { id: participant.id },
          data: { status, submittedAt: now, lastSeenAt: now },
        });
        for (const q of questions) {
          const ok = correctness.get(q.id);
          if (ok === undefined) {
            continue;
          }
          await tx.contestAnswer.updateMany({
            where: { participantId: participant.id, contestQuestionId: q.id },
            data: { isCorrect: ok },
          });
        }
        return tx.contestResult.create({
          data: {
            contestId,
            participantId: participant.id,
            userId,
            solvedCount: solved,
            wrongCount: wrong,
            unansweredCount: unanswered,
            score,
            completionSeconds,
            status: 'COMPLETED',
            finalizedAt: now,
          },
        });
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const retry = await this.prisma.contestResult.findUnique({
          where: { participantId: participant.id },
        });
        if (!retry) {
          throw error;
        }
        return this.toResult(contestId, participant, retry);
      }
      throw error;
    }
    await this.assignRanks(contestId).catch((error) =>
      this.logger.warn(
        `contest.rank-failed contest=${contestId} ${error instanceof Error ? error.message : String(error)}`,
        'Contest',
      ),
    );
    const refreshed = await this.findParticipant(contestId, userId);
    return this.toResult(contestId, refreshed ?? participant, result);
  }

  private async assignRanks(contestId: string): Promise<number> {
    const rows = await this.prisma.contestResult.findMany({
      where: { contestId },
      select: { id: true, userId: true, score: true, solvedCount: true, completionSeconds: true },
    });
    const ordered = [...rows].sort(compareContestResults);
    for (let index = 0; index < ordered.length; index += 1) {
      await this.prisma.contestResult.update({
        where: { id: ordered[index]!.id },
        data: { rank: index + 1 },
      });
    }
    return ordered.length;
  }

  private async processRatings(contestId: string): Promise<boolean> {
    const contest = await this.requireContest(contestId);
    if (contest.ratingStatus === 'COMPLETED') {
      return true;
    }
    const results = await this.prisma.contestResult.findMany({
      where: { contestId, rank: { not: null } },
      select: { userId: true, participantId: true, rank: true, score: true },
      orderBy: { rank: 'asc' },
    });
    if (results.length === 0) {
      return false;
    }
    await this.prisma.contest.update({
      where: { id: contestId },
      data: { ratingStatus: 'PROCESSING', ratingAttempts: { increment: 1 } },
    });
    const ratings = await this.prisma.contestRating.findMany({
      where: { userId: { in: results.map((r) => r.userId) } },
      select: { userId: true, rating: true },
    });
    const byUser = new Map(ratings.map((r) => [r.userId, r.rating]));
    const average =
      ratings.length > 0
        ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
        : DEFAULT_CONTEST_RATING;
    for (const row of results) {
      const before = byUser.get(row.userId) ?? DEFAULT_CONTEST_RATING;
      const calc = this.ratings.calculate({
        ratingBefore: before,
        rank: row.rank ?? results.length,
        fieldSize: results.length,
        fieldAverage: average,
      });
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.contestRating.upsert({
            where: { userId: row.userId },
            update: {},
            create: { userId: row.userId, rating: DEFAULT_CONTEST_RATING },
          });
          await tx.contestRating.update({
            where: { userId: row.userId },
            data: {
              rating: calc.ratingAfter,
              contestsPlayed: { increment: 1 },
              lastPlayedAt: new Date(),
            },
          });
          await tx.contestRatingHistory.create({
            data: {
              userId: row.userId,
              contestId,
              participantId: row.participantId,
              ratingBefore: calc.ratingBefore,
              ratingAfter: calc.ratingAfter,
              ratingChange: calc.ratingChange,
              rank: row.rank ?? results.length,
              score: row.score,
              fieldSize: results.length,
            },
          });
        });
      } catch (error) {
        if (!this.isUniqueViolation(error)) {
          throw error;
        }
      }
    }
    for (const row of results) {
      const history = await this.prisma.contestRatingHistory.findMany({
        where: { userId: row.userId },
        select: { rank: true },
      });
      const best =
        history.length > 0 ? Math.min(...history.map((h) => h.rank)) : (row.rank ?? null);
      if (best !== null) {
        await this.prisma.contestRating.update({
          where: { userId: row.userId },
          data: { bestRank: best },
        });
      }
    }
    await this.prisma.contest.update({
      where: { id: contestId },
      data: { ratingStatus: 'COMPLETED', ratingProcessedAt: new Date() },
    });
    return true;
  }

  private async requireContest(contestId: string): Promise<ContestRow> {
    const contest = (await this.prisma.contest.findUnique({
      where: { id: contestId },
      include: {
        createdBy: { select: { displayName: true } },
        _count: { select: { participants: true } },
      },
    })) as ContestRow | null;
    if (!contest) {
      throw new ContestNotFoundError();
    }
    return contest;
  }

  private async findParticipant(contestId: string, userId: string): Promise<ParticipantRow | null> {
    return (await this.prisma.contestParticipant.findUnique({
      where: { contestId_userId: { contestId, userId } },
    })) as ParticipantRow | null;
  }

  private async requireParticipant(contestId: string, userId: string): Promise<ParticipantRow> {
    if (!userId) {
      throw new AuthRequiredError('Sign in to enter this contest.');
    }
    const participant = await this.findParticipant(contestId, userId);
    if (!participant) {
      throw new ContestNotRegisteredError();
    }
    return participant;
  }

  private async requireAnswerable(contestId: string, userId: string, questionId: string) {
    const contest = await this.requireContest(contestId);
    this.assertParticipable(contest);
    const participant = await this.requireParticipant(contestId, userId);
    if (participant.status === 'SUBMITTED' || participant.status === 'AUTO_SUBMITTED') {
      throw new ContestStateError('This contest was already submitted.');
    }
    if (!participant.startedAt || !participant.effectiveEndAt) {
      throw new ContestNotRegisteredError('Enter the contest to start your session.');
    }
    const now = new Date();
    if (now >= participant.effectiveEndAt || now >= contest.endsAt) {
      await this.finalizeParticipant(contestId, userId, true);
      throw new ContestExpiredError();
    }
    const question = (await this.prisma.contestQuestion.findFirst({
      where: { id: questionId, contestId },
      include: {
        problem: {
          include: {
            assets: { orderBy: { position: 'asc' } },
            options: { orderBy: { position: 'asc' } },
          },
        },
      },
    })) as QuestionRow | null;
    if (!question) {
      throw new ContestQuestionError();
    }
    return { contest, participant, question };
  }

  private assertParticipable(contest: ContestRow): void {
    if (
      contest.status === 'DRAFT' ||
      contest.status === 'CANCELLED' ||
      contest.status === 'ARCHIVED'
    ) {
      throw new ContestNotFoundError('This contest is not available.');
    }
  }

  private assertRegistrationOpen(contest: ContestRow): void {
    if (
      contest.status === 'DRAFT' ||
      contest.status === 'CANCELLED' ||
      contest.status === 'ARCHIVED' ||
      contest.status === 'ENDED'
    ) {
      throw new ContestRegistrationError('Registration is not available for this contest.');
    }
    const now = new Date();
    if (contest.registrationOpensAt && now < contest.registrationOpensAt) {
      throw new ContestRegistrationError('Registration has not opened yet.');
    }
    if (contest.registrationClosesAt && now > contest.registrationClosesAt) {
      throw new ContestRegistrationError('Registration has closed.');
    }
    if (now > contest.endsAt) {
      throw new ContestRegistrationError('This contest has ended.');
    }
  }

  private async loadQuestions(contestId: string): Promise<QuestionRow[]> {
    return (await this.prisma.contestQuestion.findMany({
      where: { contestId },
      orderBy: { position: 'asc' },
      include: {
        problem: {
          include: {
            assets: { orderBy: { position: 'asc' } },
            options: { orderBy: { position: 'asc' } },
          },
        },
      },
    })) as QuestionRow[];
  }

  private async resolveOptionUrls(questions: QuestionRow[]): Promise<Map<string, string>> {
    const keys: string[] = [];
    for (const q of questions) {
      for (const asset of q.problem.assets) {
        keys.push(asset.objectKey);
      }
      for (const option of q.problem.options) {
        if (option.assetKey) {
          keys.push(option.assetKey);
        }
      }
    }
    return this.storage.getDownloadUrls(keys);
  }

  private async toQuestionView(
    question: QuestionRow,
    answer: { selectedOptionId: string | null; markedForReview: boolean } | null,
    opts: { answerable: boolean; reveal: boolean },
    urls: Map<string, string>,
  ): Promise<ContestQuestionViewDto> {
    const assets = question.problem.assets.map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      url: urls.get(asset.objectKey) ?? '',
      mimeType: asset.mimeType,
      position: asset.position,
      altText: asset.altText,
    }));
    const options = question.problem.options.map((option) => ({
      id: option.id,
      position: option.position,
      text: option.text,
      assetUrl: option.assetKey ? (urls.get(option.assetKey) ?? null) : null,
    }));
    const correct = question.problem.options.find((o) => o.isCorrect);
    const view: ContestQuestionViewDto = {
      position: question.position,
      questionId: question.id,
      problemId: question.problem.id,
      title: question.problem.title,
      statement: question.problem.statement,
      contentMode: question.problem.contentMode,
      difficulty: question.problem.difficulty,
      assets,
      options,
      selectedOptionId: answer?.selectedOptionId ?? null,
      markedForReview: answer?.markedForReview ?? false,
      answerable: opts.answerable,
    };
    if (opts.reveal) {
      view.correctOptionId = correct?.id ?? null;
      view.explanation = question.problem.explanation ?? null;
      view.shortcut = question.problem.shortcut ?? null;
    }
    return view;
  }

  private async answerCounts(participantId: string) {
    const answers = await this.prisma.contestAnswer.findMany({
      where: { participantId },
      select: { selectedOptionId: true, markedForReview: true },
    });
    return {
      saved: true,
      answeredCount: answers.filter((a) => a.selectedOptionId).length,
      reviewCount: answers.filter((a) => a.markedForReview).length,
    };
  }

  private async registeredSet(contestIds: string[], userId?: string): Promise<Set<string>> {
    if (!userId || contestIds.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.contestParticipant.findMany({
      where: { contestId: { in: contestIds }, userId },
      select: { contestId: true },
    });
    return new Set(rows.map((row) => row.contestId));
  }

  private toSummary(contest: ContestRow, isRegistered: boolean): ContestSummaryDto {
    const now = new Date();
    const live = contest.status === 'LIVE' && now >= contest.startsAt && now <= contest.endsAt;
    const past =
      contest.status === 'ENDED' || contest.status === 'ARCHIVED' || now > contest.endsAt;
    const phase = live ? 'live' : past ? 'past' : 'upcoming';
    return {
      id: contest.id,
      name: contest.title,
      description: contest.description,
      status: contest.status,
      phase,
      difficulty: contest.difficulty,
      durationSeconds: contest.durationSeconds,
      durationMinutes: Math.round(contest.durationSeconds / 60),
      questionCount: contest.questionCount,
      participantCount: contest._count.participants,
      maxParticipants: contest.maxParticipants,
      startsAt: contest.startsAt.toISOString(),
      endsAt: contest.endsAt.toISOString(),
      registrationOpensAt: contest.registrationOpensAt?.toISOString() ?? null,
      registrationClosesAt: contest.registrationClosesAt?.toISOString() ?? null,
      registrationOpen: this.isRegistrationOpen(contest, now),
      isRegistered,
      organizer: {
        id: contest.createdById,
        displayName: contest.createdBy?.displayName ?? 'ApteeZ',
      },
    };
  }

  private isRegistrationOpen(contest: ContestRow, now: Date): boolean {
    if (
      contest.status === 'DRAFT' ||
      contest.status === 'CANCELLED' ||
      contest.status === 'ARCHIVED' ||
      contest.status === 'ENDED' ||
      now > contest.endsAt
    ) {
      return false;
    }
    if (contest.registrationOpensAt && now < contest.registrationOpensAt) {
      return false;
    }
    if (contest.registrationClosesAt && now > contest.registrationClosesAt) {
      return false;
    }
    return true;
  }

  private async toResult(
    contestId: string,
    participant: ParticipantRow,
    result: {
      solvedCount: number;
      wrongCount: number;
      unansweredCount: number;
      score: number;
      completionSeconds: number;
      rank: number | null;
      finalizedAt: Date;
    },
  ): Promise<ContestResultDto> {
    const totalParticipants = await this.prisma.contestResult.count({ where: { contestId } });
    const rating = await this.prisma.contestRatingHistory.findUnique({
      where: { contestId_userId: { contestId, userId: participant.userId } },
      select: { ratingBefore: true, ratingAfter: true, ratingChange: true },
    });
    return {
      contestId,
      participantStatus: participant.status,
      solvedCount: result.solvedCount,
      wrongCount: result.wrongCount,
      unansweredCount: result.unansweredCount,
      score: result.score,
      completionSeconds: result.completionSeconds,
      rank: result.rank,
      totalParticipants,
      finalizedAt: result.finalizedAt.toISOString(),
      submittedAt: participant.submittedAt?.toISOString() ?? null,
      autoSubmitted: participant.status === 'AUTO_SUBMITTED',
      rating: rating
        ? { before: rating.ratingBefore, after: rating.ratingAfter, change: rating.ratingChange }
        : null,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }
    return (error as { code?: unknown }).code === 'P2002';
  }
}
