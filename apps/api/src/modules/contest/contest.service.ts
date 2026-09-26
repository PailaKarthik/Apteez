import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@apteez/database';
import type { ContestDetailDto, ContestSessionDto, ContestSummaryDto } from '@apteez/types';
import type { ContestListQuery } from '@apteez/validation';
import { AppLogger } from '../../common/logger/app-logger';
import { RedisLockService } from '../../redis/redis-lock.service';
import { StorageService } from '../../storage/storage.service';
import { PointsService } from '../rewards/points.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { ContestForbiddenError, ContestNotFoundError } from './contest.errors';
import { ContestRepository } from './contest.repository';
import { ContestRatingCalculator } from './contest-rating.calculator';
import { canTransitionContest } from './contest.util';

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

/**
 * Management caller: `manage:contests` is enforced at the route (requireArea),
 * ownership (organizers manage their own, admins any) is enforced per contest.
 */
export interface ContestCaller {
  id: string;
  roles: string[];
  permissions: string[];
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
import { contestScoreFor } from './contest.util';
import type {
  ContestDraftDto,
  ContestLeaderboardEntryDto,
  ContestManageDto,
  ContestManageQuestionDto,
  ContestNavigatorItemDto,
  ContestQuestionViewDto,
  ContestResultDto,
  ContestSubmitPreviewDto,
  ContestUpsolveDto,
  PaginatedData,
} from '@apteez/types';
import type {
  ContestCreateInput,
  ContestQuestionAddInput,
  OrganizerContestPatchInput,
} from '@apteez/validation';
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
    private readonly points: PointsService,
    private readonly analytics: AnalyticsService,
    private readonly logger: AppLogger,
  ) {}

  async list(query: ContestListQuery, userId?: string): Promise<PaginatedData<ContestSummaryDto>> {
    // Advance due statuses first: without this, a contest whose start passed
    // sits in "upcoming" until somebody opens its detail page.
    await this.sweepStatuses();
    // Every contest mixes easy→hard problems, so discovery filters by phase
    // only — there is no difficulty dimension on contests.
    const where: Prisma.ContestWhereInput = {
      status: { in: ['PUBLISHED', 'REGISTRATION_OPEN', 'LIVE', 'ENDED', 'ARCHIVED'] },
    };
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
    const contest = await this.syncStatus(contestId);
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
    const contest = await this.syncStatus(contestId);
    this.assertRegistrationOpen(contest);
    const existing = await this.findParticipant(contestId, userId);
    if (existing) {
      return { registered: true, status: existing.status };
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        if (contest.maxParticipants !== null) {
          // Serialize capacity checks on the contest row: without the lock,
          // two concurrent registrations can both pass the count check and
          // overbook past maxParticipants (TOCTOU).
          await tx.$queryRaw`SELECT "id" FROM "contests" WHERE "id" = ${contestId}::uuid FOR UPDATE`;
          // Count only live seats: terminal/transient rows (e.g. DISQUALIFIED)
          // must not permanently occupy capacity.
          const count = await tx.contestParticipant.count({
            where: {
              contestId,
              status: { in: ['REGISTERED', 'ACTIVE', 'SUBMITTED', 'AUTO_SUBMITTED'] },
            },
          });
          if (count >= contest.maxParticipants) {
            throw new ContestRegistrationError('This contest is full.');
          }
        }
        await tx.contestParticipant.create({
          data: { contestId, userId, status: 'REGISTERED' },
        });
      });
    } catch (error) {
      if (error instanceof ContestRegistrationError) {
        throw error;
      }
      if (this.isUniqueViolation(error)) {
        return { registered: true, status: 'REGISTERED' };
      }
      if (contest.maxParticipants === null) {
        // No capacity check to serialize: a pooler-aborted transaction can
        // safely fall back to a plain idempotent create instead of 500ing.
        try {
          await this.prisma.contestParticipant.create({
            data: { contestId, userId, status: 'REGISTERED' },
          });
        } catch (fallback) {
          if (!this.isUniqueViolation(fallback)) {
            throw error;
          }
        }
        return { registered: true, status: 'REGISTERED' };
      }
      throw new ContestRegistrationError('Registration hit a temporary issue. Try again shortly.');
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

  // ─── Organizer management (DRAFT → publish flow) ──────────────────────────

  /**
   * Step 1 of creation: the contest format (question count + length first).
   * Always lands in DRAFT; questions are attached one by one afterwards and
   * publish is a separate, validated transition.
   */
  async createContest(caller: ContestCaller, input: ContestCreateInput): Promise<ContestManageDto> {
    const slug = await this.uniqueSlug(input.title);
    const contest = await this.prisma.contest.create({
      data: {
        title: input.title,
        slug,
        description: input.description ?? null,
        rules: input.rules ?? null,
        difficulty: input.difficulty,
        status: 'DRAFT',
        questionCount: input.questionCount,
        durationSeconds: input.durationMinutes * 60,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        registrationOpensAt: input.registrationOpensAt ?? null,
        registrationClosesAt: input.registrationClosesAt ?? null,
        maxParticipants: input.maxParticipants ?? null,
        resultVisibility: input.resultVisibility,
        revealAnswersLive: input.revealAnswersLive,
        createdById: caller.id,
      },
      select: { id: true },
    });
    this.logger.log(
      `contest.created id=${contest.id} by=${caller.id} questions=${input.questionCount} durationMin=${input.durationMinutes}`,
      'Contest',
    );
    return this.manageView(contest.id, caller);
  }

  /** Full manage view for the wizard: format + attached questions + blockers. */
  async manageView(contestId: string, caller: ContestCaller): Promise<ContestManageDto> {
    const contest = await this.requireContest(contestId);
    this.assertCanManage(contest, caller);
    return this.toManage(contest);
  }

  /**
   * Resume list: unfinished DRAFT setups the caller may manage. Admins see
   * every draft; plain creators see only their own. Newest first so the
   * setup just left off is always on top.
   */
  async listDrafts(caller: ContestCaller): Promise<ContestDraftDto[]> {
    const elevated =
      caller.permissions.includes('manage:platform') || caller.roles.includes('admin');
    const rows = await this.prisma.contest.findMany({
      where: {
        status: 'DRAFT',
        ...(elevated ? {} : { createdById: caller.id }),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        title: true,
        questionCount: true,
        durationSeconds: true,
        updatedAt: true,
        _count: { select: { questions: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      questionCount: row.questionCount,
      addedCount: row._count.questions,
      durationMinutes: Math.round(row.durationSeconds / 60),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  /** Edit the format while still a DRAFT (schedule, size, copy). */
  async updateDraft(
    contestId: string,
    caller: ContestCaller,
    input: OrganizerContestPatchInput,
  ): Promise<ContestManageDto> {
    const contest = await this.requireDraft(contestId, caller);
    const added = await this.prisma.contestQuestion.count({ where: { contestId } });
    if (input.questionCount !== undefined && input.questionCount < added) {
      throw new ContestStateError(
        `This contest already has ${added} questions — the target cannot drop below that.`,
      );
    }
    if (
      input.maxParticipants !== undefined &&
      input.maxParticipants !== null &&
      input.maxParticipants < contest._count.participants
    ) {
      throw new ContestStateError(
        `Capacity cannot drop below the ${contest._count.participants} already registered.`,
      );
    }
    await this.prisma.contest.update({
      where: { id: contestId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.rules !== undefined ? { rules: input.rules } : {}),
        ...(input.difficulty !== undefined ? { difficulty: input.difficulty } : {}),
        ...(input.questionCount !== undefined ? { questionCount: input.questionCount } : {}),
        ...(input.durationMinutes !== undefined
          ? { durationSeconds: input.durationMinutes * 60 }
          : {}),
        ...(input.startsAt ? { startsAt: input.startsAt } : {}),
        ...(input.endsAt ? { endsAt: input.endsAt } : {}),
        ...(input.registrationOpensAt !== undefined
          ? { registrationOpensAt: input.registrationOpensAt }
          : {}),
        ...(input.registrationClosesAt !== undefined
          ? { registrationClosesAt: input.registrationClosesAt }
          : {}),
        ...(input.maxParticipants !== undefined ? { maxParticipants: input.maxParticipants } : {}),
        ...(input.resultVisibility !== undefined
          ? { resultVisibility: input.resultVisibility }
          : {}),
        ...(input.revealAnswersLive !== undefined
          ? { revealAnswersLive: input.revealAnswersLive }
          : {}),
      },
    });
    return this.manageView(contestId, caller);
  }

  /**
   * Step 2 of creation: attach one published problem. Positions always append
   * in order (0, 1, 2…), so the wizard fills slot N before slot N+1 exists —
   * exactly the one-by-one flow, with no gaps to corrupt navigation.
   */
  async addQuestion(
    contestId: string,
    caller: ContestCaller,
    input: ContestQuestionAddInput,
  ): Promise<ContestManageDto> {
    const contest = await this.requireDraft(contestId, caller);
    const problem = await this.prisma.problem.findUnique({
      where: { id: input.problemId },
      select: { id: true, status: true },
    });
    if (!problem || problem.status !== 'PUBLISHED') {
      throw new ContestQuestionError('Only published problems can be added to a contest.');
    }
    const added = await this.prisma.contestQuestion.count({ where: { contestId } });
    if (added >= contest.questionCount) {
      throw new ContestStateError(
        `This contest needs exactly ${contest.questionCount} questions — remove one first to swap it.`,
      );
    }
    if (input.position !== undefined && input.position !== added) {
      throw new ContestQuestionError(
        `Questions fill in order — slot ${added + 1} of ${contest.questionCount} is next.`,
      );
    }
    try {
      await this.prisma.contestQuestion.create({
        data: { contestId, problemId: input.problemId, position: added },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ContestQuestionError('That problem is already in this contest.');
      }
      throw error;
    }
    return this.manageView(contestId, caller);
  }

  /** Detach a question from a DRAFT; later slots collapse to stay dense. */
  async removeQuestion(
    contestId: string,
    caller: ContestCaller,
    questionId: string,
  ): Promise<ContestManageDto> {
    await this.requireDraft(contestId, caller);
    const row = await this.prisma.contestQuestion.findFirst({
      where: { id: questionId, contestId },
      select: { id: true, position: true },
    });
    if (!row) {
      throw new ContestQuestionError();
    }
    await this.prisma.contestQuestion.delete({ where: { id: row.id } });
    await this.prisma.contestQuestion.updateMany({
      where: { contestId, position: { gt: row.position } },
      data: { position: { decrement: 1 } },
    });
    return this.manageView(contestId, caller);
  }

  /**
   * Publish a completed DRAFT. Lands in REGISTRATION_OPEN when the window is
   * already open, else PUBLISHED — the lazy lifecycle takes it LIVE at
   * startsAt and closes (rank + rate) at endsAt with no cron needed.
   */
  async publishContest(contestId: string, caller: ContestCaller): Promise<ContestManageDto> {
    const contest = await this.requireDraft(contestId, caller);
    const view = await this.toManage(contest);
    if (!view.canPublish) {
      throw new ContestStateError(
        view.publishBlockers[0] ?? 'This contest is not ready to publish.',
      );
    }
    const now = new Date();
    const target =
      contest.registrationOpensAt && now >= contest.registrationOpensAt
        ? 'REGISTRATION_OPEN'
        : 'PUBLISHED';
    if (!canTransitionContest('DRAFT', target)) {
      throw new ContestStateError('This contest cannot be published from its current state.');
    }
    await this.prisma.contest.update({
      where: { id: contestId },
      data: { status: target, publishedAt: now },
    });
    this.logger.log(`contest.published id=${contestId} by=${caller.id} -> ${target}`, 'Contest');
    return this.manageView(contestId, caller);
  }

  private async requireDraft(contestId: string, caller: ContestCaller): Promise<ContestRow> {
    const contest = await this.requireContest(contestId);
    this.assertCanManage(contest, caller);
    if (contest.status !== 'DRAFT') {
      throw new ContestStateError('Only draft contests can be edited.');
    }
    return contest;
  }

  private assertCanManage(contest: { createdById: string | null }, caller: ContestCaller): void {
    if (caller.permissions.includes('manage:platform')) {
      return;
    }
    if (caller.roles.includes('admin')) {
      return;
    }
    // Creators manage their own contests only.
    if (contest.createdById && contest.createdById === caller.id) {
      return;
    }
    throw new ContestForbiddenError();
  }

  private async uniqueSlug(title: string): Promise<string> {
    const base =
      title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50) || 'contest';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const slug = `${base}-${Date.now().toString(36)}${attempt > 0 ? `-${attempt}` : ''}`;
      const existing = await this.prisma.contest.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!existing) {
        return slug;
      }
    }
    return `${base}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
  }

  private async toManage(contest: ContestRow): Promise<ContestManageDto> {
    const rows = await this.prisma.contestQuestion.findMany({
      where: { contestId: contest.id },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        position: true,
        points: true,
        problem: { select: { id: true, title: true, difficulty: true } },
      },
    });
    const questions: ContestManageQuestionDto[] = rows.map((row) => ({
      questionId: row.id,
      position: row.position,
      points: row.points,
      problem: row.problem,
    }));
    const addedCount = questions.length;
    const now = new Date();
    const publishBlockers: string[] = [];
    if (addedCount < contest.questionCount) {
      const missing = contest.questionCount - addedCount;
      publishBlockers.push(
        `Add ${missing} more question${missing === 1 ? '' : 's'} (${addedCount} of ${contest.questionCount}).`,
      );
    }
    if (contest.endsAt <= contest.startsAt) {
      publishBlockers.push('The end must be after the start.');
    } else if (contest.startsAt <= now) {
      publishBlockers.push('The start time is in the past — move the schedule forward.');
    }
    return {
      id: contest.id,
      title: contest.title,
      description: contest.description,
      rules: contest.rules,
      status: contest.status,
      difficulty: contest.difficulty,
      questionCount: contest.questionCount,
      addedCount,
      durationSeconds: contest.durationSeconds,
      durationMinutes: Math.round(contest.durationSeconds / 60),
      startsAt: contest.startsAt.toISOString(),
      endsAt: contest.endsAt.toISOString(),
      registrationOpensAt: contest.registrationOpensAt?.toISOString() ?? null,
      registrationClosesAt: contest.registrationClosesAt?.toISOString() ?? null,
      maxParticipants: contest.maxParticipants,
      participantCount: contest._count.participants,
      resultVisibility: contest.resultVisibility,
      revealAnswersLive: contest.revealAnswersLive,
      canPublish: contest.status === 'DRAFT' && publishBlockers.length === 0,
      publishBlockers,
      questions,
      createdById: contest.createdById,
      ratingStatus: contest.ratingStatus,
    };
  }

  async start(contestId: string, userId: string): Promise<ContestSessionDto> {
    const contest = await this.syncStatus(contestId);
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
    const contest = await this.syncStatus(contestId);
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
    await this.syncStatus(contestId);
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
    // Sync first: opening your result after endsAt closes the contest, so
    // the rating below is already settled instead of perpetually pending.
    await this.syncStatus(contestId);
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
    const contest = await this.syncStatus(contestId);
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
    // Rating deltas ride along (single query) — null until ratings settle.
    const histories = await this.prisma.contestRatingHistory.findMany({
      where: { contestId, userId: { in: rows.map((row) => row.userId) } },
      select: { userId: true, ratingChange: true },
    });
    const changeByUser = new Map(
      histories.map((history) => [history.userId, history.ratingChange]),
    );
    return {
      items: rows.map((row, index) => ({
        rank: row.rank ?? offset + index + 1,
        userId: row.userId,
        username: live ? null : (row.user.username ?? null),
        ratingChange: live ? null : (changeByUser.get(row.userId) ?? null),
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

  /** Global contest-rating leaderboard: overall performance across contests. */
  async ratingLeaderboard(
    institution: string | undefined,
    limit: number,
  ): Promise<
    Array<{
      rank: number;
      userId: string;
      username: string | null;
      displayName: string;
      avatarKey: string | null;
      institution: string | null;
      rating: number;
      tier: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT' | 'ELITE';
      contestsPlayed: number;
      bestRank: number | null;
    }>
  > {
    const rows = await this.prisma.contestRating.findMany({
      where: institution ? { user: { institution } } : {},
      orderBy: [{ rating: 'desc' }, { userId: 'asc' }],
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarKey: true,
            institution: true,
          },
        },
      },
    });
    return rows.map((row, index) => ({
      rank: index + 1,
      userId: row.userId,
      username: row.user.username,
      displayName: row.user.displayName,
      avatarKey: row.user.avatarKey,
      institution: row.user.institution,
      rating: row.rating,
      tier: this.ratings.tierFor(row.rating),
      contestsPlayed: row.contestsPlayed,
      bestRank: row.bestRank,
    }));
  }

  async upsolve(contestId: string, userId: string): Promise<ContestUpsolveDto> {
    const contest = await this.syncStatus(contestId);
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

  /**
   * Discovery-time lifecycle sweep. Status flips are awaited (two cheap bulk
   * writes) so the live tab is correct on THIS response; ended-contest closes
   * (rank + rate) run in the background, bounded to the 5 most overdue —
   * syncStatus converges them on detail reads regardless.
   */
  private async sweepStatuses(): Promise<void> {
    const now = new Date();
    try {
      await this.prisma.contest.updateMany({
        where: {
          status: 'PUBLISHED',
          registrationOpensAt: { lte: now },
          startsAt: { gt: now },
        },
        data: { status: 'REGISTRATION_OPEN' },
      });
      await this.prisma.contest.updateMany({
        where: {
          status: { in: ['PUBLISHED', 'REGISTRATION_OPEN'] },
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
        data: { status: 'LIVE' },
      });
    } catch (error) {
      this.logger.warn(
        `contest.sweep-flip-failed ${error instanceof Error ? error.message : String(error)}`,
        'Contest',
      );
      return;
    }
    let overdue: Array<{ id: string }> = [];
    try {
      overdue = await this.prisma.contest.findMany({
        where: {
          status: { in: ['PUBLISHED', 'REGISTRATION_OPEN', 'LIVE'] },
          endsAt: { lte: now },
        },
        select: { id: true },
        orderBy: { endsAt: 'asc' },
        take: 5,
      });
    } catch (error) {
      this.logger.warn(
        `contest.sweep-scan-failed ${error instanceof Error ? error.message : String(error)}`,
        'Contest',
      );
      return;
    }
    if (overdue.length > 0) {
      void (async () => {
        for (const row of overdue) {
          await this.syncStatus(row.id).catch(() => undefined);
        }
      })();
    }
  }

  /**
   * Manual repair for stuck ratings (FAILED after retries, or PENDING long
   * after the end). Re-running is safe: ranks recompute deterministically,
   * rating writes are conditional on the expected `before` value, and the
   * history unique makes replays converge instead of double-applying.
   */
  async retryRatings(
    contestId: string,
    caller: ContestCaller,
  ): Promise<{ ranked: number; ratingsApplied: boolean; ratingStatus: string }> {
    const contest = await this.requireContest(contestId);
    this.assertCanManage(contest, caller);
    if (new Date() < contest.endsAt && contest.status !== 'ENDED') {
      throw new ContestStateError('Ratings settle after the contest ends.');
    }
    const outcome = await this.closeContest(contestId);
    const fresh = await this.requireContest(contestId);
    return { ...outcome, ratingStatus: fresh.ratingStatus };
  }

  /**
   * Lazy lifecycle driver — no cron needed (free-tier friendly). Every
   * participant-facing read funnels through here, so statuses move on time:
   * PUBLISHED → REGISTRATION_OPEN → LIVE at startsAt, and close (ENDED +
   * rank + rate) at endsAt. Idempotent and lock-guarded; terminal states
   * (DRAFT/CANCELLED/ARCHIVED/ENDED) never move except a FAILED-rating retry.
   */
  private async syncStatus(contestId: string): Promise<ContestRow> {
    const contest = await this.requireContest(contestId);
    const now = new Date();
    if (contest.status === 'ENDED' || contest.status === 'ARCHIVED') {
      // A failed rating step gets retried lazily (bounded attempts), so one
      // transient outage at close time never bricks ratings permanently.
      if (contest.status === 'ENDED' && contest.ratingStatus === 'FAILED') {
        const attempts = await this.prisma.contest
          .findUnique({ where: { id: contestId }, select: { ratingAttempts: true } })
          .then((row) => row?.ratingAttempts ?? 99);
        if (attempts < 3) {
          await this.closeContest(contestId).catch(() => undefined);
          return this.requireContest(contestId);
        }
      }
      return contest;
    }
    if (contest.status === 'DRAFT' || contest.status === 'CANCELLED') {
      return contest;
    }
    if (now >= contest.endsAt) {
      await this.closeContest(contestId).catch(() => undefined);
      const closed = await this.requireContest(contestId);
      if (canTransitionContest(closed.status, 'ENDED')) {
        await this.prisma.contest.update({
          where: { id: contestId },
          data: { status: 'ENDED', endedAt: now },
        });
        return this.requireContest(contestId);
      }
      return closed;
    }
    let next: ContestRow['status'] | null = null;
    if (
      contest.status === 'PUBLISHED' &&
      contest.registrationOpensAt &&
      now >= contest.registrationOpensAt
    ) {
      next = 'REGISTRATION_OPEN';
    }
    if (
      (contest.status === 'PUBLISHED' || contest.status === 'REGISTRATION_OPEN') &&
      now >= contest.startsAt
    ) {
      next = 'LIVE';
    }
    if (next && canTransitionContest(contest.status, next)) {
      await this.prisma.contest.update({ where: { id: contestId }, data: { status: next } });
      return this.requireContest(contestId);
    }
    return contest;
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
    // One retry for transient pooler aborts (P2028): answers are already
    // persisted per-question, so replaying finalization converges via the
    // participant/result uniques instead of losing the submission.
    let result;
    try {
      result = await this.persistFinalization(
        contestId,
        participant,
        userId,
        { status, submittedAt: now },
        questions,
        correctness,
        { solved, wrong, unanswered, score, completionSeconds, finalizedAt: now },
      );
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return this.existingResult(contestId, participant, error);
      }
      try {
        result = await this.persistFinalization(
          contestId,
          participant,
          userId,
          { status, submittedAt: now },
          questions,
          correctness,
          { solved, wrong, unanswered, score, completionSeconds, finalizedAt: now },
        );
      } catch (retryError) {
        if (this.isUniqueViolation(retryError)) {
          return this.existingResult(contestId, participant, retryError);
        }
        const raced = await this.prisma.contestResult.findUnique({
          where: { participantId: participant.id },
        });
        if (raced) {
          const refreshed = await this.findParticipant(contestId, userId);
          return this.toResult(contestId, refreshed ?? participant, raced);
        }
        throw new ContestStateError(
          'Submission hit a temporary issue. Your answers are saved — try submitting again.',
        );
      }
    }
    await this.assignRanks(contestId).catch((error) =>
      this.logger.warn(
        `contest.rank-failed contest=${contestId} ${error instanceof Error ? error.message : String(error)}`,
        'Contest',
      ),
    );
    const refreshed = await this.findParticipant(contestId, userId);
    // Activity reward for submitting. Best-effort: never rolls back the result.
    void this.points
      .awardTrigger({
        userId,
        trigger: 'contest-participate',
        sourceType: 'contest',
        sourceId: contestId,
      })
      .catch(() => undefined);
    // Fresh result only (race replays return above without recording).
    void this.analytics.record('contest.submitted', { userId, metadata: { contestId } });
    return this.toResult(contestId, refreshed ?? participant, result);
  }

  /** Single finalization write unit (participant + answers + result). */
  private async persistFinalization(
    contestId: string,
    participant: ParticipantRow,
    userId: string,
    head: { status: 'SUBMITTED' | 'AUTO_SUBMITTED'; submittedAt: Date },
    questions: QuestionRow[],
    correctness: Map<string, boolean | null>,
    result: {
      solved: number;
      wrong: number;
      unanswered: number;
      score: number;
      completionSeconds: number;
      finalizedAt: Date;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.contestParticipant.update({
        where: { id: participant.id },
        data: { status: head.status, submittedAt: head.submittedAt, lastSeenAt: head.submittedAt },
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
          solvedCount: result.solved,
          wrongCount: result.wrong,
          unansweredCount: result.unanswered,
          score: result.score,
          completionSeconds: result.completionSeconds,
          status: 'COMPLETED',
          finalizedAt: result.finalizedAt,
        },
      });
    });
  }

  /** A unique-violation means a concurrent attempt won: return its result. */
  private async existingResult(
    contestId: string,
    participant: ParticipantRow,
    error: unknown,
  ): Promise<ContestResultDto> {
    const retry = await this.prisma.contestResult.findUnique({
      where: { participantId: participant.id },
    });
    if (!retry) {
      throw error;
    }
    return this.toResult(contestId, participant, retry);
  }

  private async assignRanks(contestId: string): Promise<number> {
    // Single set-based statement instead of one UPDATE per participant.
    // ROW_NUMBER order mirrors compareContestResults exactly (score DESC,
    // solvedCount DESC, completionSeconds ASC, userId ASC — UUID text, so
    // SQL collation agrees with the JS tiebreak).
    const ranked = await this.prisma.$queryRaw<Array<{ id: string }>>`
      WITH ranked AS (
        SELECT "id", ROW_NUMBER() OVER (
          ORDER BY "score" DESC, "solvedCount" DESC, "completionSeconds" ASC, "userId" ASC
        ) AS rn
        FROM "contest_results"
        WHERE "contestId" = ${contestId}::uuid
      )
      UPDATE "contest_results" AS r SET "rank" = ranked.rn
      FROM ranked WHERE r."id" = ranked."id"
      RETURNING r."id"`;
    return ranked.length;
  }

  private async processRatings(contestId: string): Promise<boolean> {
    const contest = await this.requireContest(contestId);
    if (contest.ratingStatus === 'COMPLETED') {
      return true;
    }
    const results = await this.prisma.contestResult.findMany({
      where: { contestId, rank: { not: null } },
      select: {
        userId: true,
        participantId: true,
        rank: true,
        score: true,
        completionSeconds: true,
      },
      orderBy: { rank: 'asc' },
    });
    if (results.length === 0) {
      // Nobody finished — nothing to rate, but the pipeline is done.
      // (Previously this returned false forever, stranding ratingStatus.)
      await this.prisma.contest
        .update({ where: { id: contestId }, data: { ratingStatus: 'COMPLETED' } })
        .catch(() => undefined);
      return true;
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
    // Pace baseline: finishers faster than the field median earn a bounded
    // speed bonus on top of their rank performance (and vice versa).
    const times = results
      .map((r) => r.completionSeconds)
      .filter((t): t is number => typeof t === 'number' && t >= 0)
      .sort((a, b) => a - b);
    const medianSeconds =
      times.length > 0 ? (times[Math.floor((times.length - 1) / 2)] as number) : null;
    // No interactive transaction: the pooler kills those with P2028. Each
    // side is a conditional single-statement write (moves only from the
    // expected `before` value) plus the history unique — a retry converges
    // instead of double-applying.
    for (const row of results) {
      const rank = row.rank ?? results.length;
      const historyKey = { contestId_userId: { contestId, userId: row.userId } };
      const already = await this.prisma.contestRatingHistory.findUnique({
        where: historyKey,
        select: { id: true },
      });
      if (already) {
        continue;
      }
      const before = byUser.get(row.userId) ?? DEFAULT_CONTEST_RATING;
      const calc = this.ratings.calculate({
        ratingBefore: before,
        rank,
        fieldSize: results.length,
        fieldAverage: average,
        completionSeconds: row.completionSeconds,
        fieldMedianSeconds: medianSeconds,
      });
      const moved = await this.prisma.contestRating.updateMany({
        where: { userId: row.userId, rating: before },
        data: {
          rating: calc.ratingAfter,
          contestsPlayed: { increment: 1 },
          lastPlayedAt: new Date(),
        },
      });
      if (moved.count === 0) {
        // Missing row (never played) or a concurrent move: create-then-move,
        // else verify convergence, else fail loudly instead of corrupting.
        const current = await this.prisma.contestRating.findUnique({
          where: { userId: row.userId },
          select: { rating: true },
        });
        if (!current) {
          try {
            await this.prisma.contestRating.create({
              data: { userId: row.userId, rating: before },
            });
          } catch (error) {
            if (!this.isUniqueViolation(error)) {
              throw error;
            }
          }
          const retry = await this.prisma.contestRating.updateMany({
            where: { userId: row.userId, rating: before },
            data: {
              rating: calc.ratingAfter,
              contestsPlayed: { increment: 1 },
              lastPlayedAt: new Date(),
            },
          });
          if (retry.count === 0) {
            throw new Error(`contest rating lost race user=${row.userId} contest=${contestId}`);
          }
        } else if (current.rating === calc.ratingAfter) {
          const replayed = await this.prisma.contestRatingHistory.findUnique({
            where: historyKey,
            select: { id: true },
          });
          if (replayed) {
            continue;
          }
          // A prior attempt moved the rating but crashed before the history
          // row: replay just the insert with the same deterministic values.
        } else {
          throw new Error(
            `contest rating moved concurrently user=${row.userId} contest=${contestId}`,
          );
        }
      }
      try {
        await this.prisma.contestRatingHistory.create({
          data: {
            userId: row.userId,
            contestId,
            participantId: row.participantId,
            ratingBefore: calc.ratingBefore,
            ratingAfter: calc.ratingAfter,
            ratingChange: calc.ratingChange,
            rank,
            score: row.score,
            fieldSize: results.length,
          },
        });
      } catch (error) {
        if (!this.isUniqueViolation(error)) {
          throw error;
        }
      }
    }
    // Single set-based best-rank refresh across the whole field instead of
    // one history read + one update per participant.
    await this.prisma.$queryRaw`
      UPDATE "contest_ratings" AS cr
      SET "bestRank" = LEAST(COALESCE(cr."bestRank", 2147483647), ranked.minrank)
      FROM (
        SELECT "userId", MIN("rank") AS minrank
        FROM "contest_rating_history"
        WHERE "userId" = ANY(${results.map((row) => row.userId)}::uuid[])
        GROUP BY "userId"
      ) AS ranked
      WHERE cr."userId" = ranked."userId"`;
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
    const contest = await this.syncStatus(contestId);
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
