import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import type { AttemptDto, AttemptResultDto } from '@apteez/types';
import type { SubmitAttemptInput } from '@apteez/validation';
import { AppLogger } from '../../common/logger/app-logger';
import { ProblemsService } from '../problems/problems.service';
import { PointsService } from '../rewards/points.service';
import { AnalyticsService } from '../analytics/analytics.service';

/**
 * A practice duration is capped defensively: a stale browser tab must not
 * record an absurd attempt time. Negative/NaN durations clamp to zero.
 */
const MAX_PRACTICE_SECONDS = 6 * 60 * 60;

/**
 * Server-authoritative practice engine. The client may only *identify* the
 * selected option; correctness, timing and the reveal are computed here.
 *
 * SOLVED RULE: a problem is solved by a user when they have at least one
 * SUBMITTED and correct attempt for it. Opening a problem never solves it.
 *
 * Idempotency/concurrency: finalization is a single conditional
 * `updateMany` claim on `status = STARTED`. Concurrent or repeated submits
 * therefore produce exactly one finalized row; every subsequent call returns
 * the already-finalized result rather than mutating it.
 */
@Injectable()
export class PracticeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly problems: ProblemsService,
    private readonly points: PointsService,
    private readonly analytics: AnalyticsService,
    private readonly logger: AppLogger,
  ) {}

  async startAttempt(userId: string, problemId: string): Promise<AttemptDto> {
    const problem = await this.prisma.problem.findFirst({
      where: { id: problemId, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (!problem) {
      throw this.problemNotFound();
    }
    const attempt = await this.prisma.submission.create({
      data: { userId, problemId, context: 'PRACTICE', status: 'STARTED' },
      select: { id: true, problemId: true, context: true, status: true, startedAt: true },
    });
    this.logger.log(
      `practice.start userId=${userId} problem=${problemId} attempt=${attempt.id}`,
      'Practice',
    );
    return this.toAttemptDto(attempt);
  }

  async submitAttempt(
    userId: string,
    problemId: string,
    attemptId: string,
    input: SubmitAttemptInput,
  ): Promise<AttemptResultDto> {
    const attempt = await this.prisma.submission.findFirst({
      where: { id: attemptId, userId },
    });
    if (!attempt || attempt.problemId !== problemId) {
      throw this.attemptNotFound();
    }
    if (attempt.context !== 'PRACTICE') {
      throw new BadRequestException({
        statusCode: 400,
        code: 'BAD_REQUEST',
        message: 'This attempt does not belong to a practice session.',
      });
    }

    // Idempotent replay: a finalized attempt is never mutated, so the first
    // result stands and is returned again. The solve reward is re-checked
    // here too so a retry after a partial failure still grants it exactly once.
    if (attempt.status === 'SUBMITTED') {
      if (attempt.isCorrect === true) {
        void this.points
          .awardTrigger({
            userId,
            trigger: 'problem-solve',
            sourceType: 'submission',
            sourceId: attemptId,
          })
          .catch(() => undefined);
      }
      return this.buildResult(attempt, userId);
    }
    if (attempt.status !== 'STARTED') {
      throw new ConflictException({
        statusCode: 409,
        code: 'ATTEMPT_NOT_ACTIVE',
        message: 'This attempt is no longer active.',
      });
    }

    const option = await this.prisma.problemOption.findFirst({
      where: { id: input.selectedOptionId, problemId },
      select: { id: true, isCorrect: true },
    });
    if (!option) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: [
          { field: 'selectedOptionId', message: 'This option does not belong to the problem' },
        ],
      });
    }

    const now = new Date();
    const claimed = await this.prisma.submission.updateMany({
      where: { id: attemptId, userId, status: 'STARTED' },
      data: {
        status: 'SUBMITTED',
        selectedOptionId: option.id,
        isCorrect: option.isCorrect,
        submittedAt: now,
        timeSpentSeconds: computeTimeSpent(attempt.startedAt, now),
        clientTimeSpentSeconds: input.clientTimeSpentSeconds ?? null,
      },
    });

    const finalized = await this.prisma.submission.findUniqueOrThrow({ where: { id: attemptId } });
    if (claimed.count === 0) {
      // Lost a concurrent race: the other request already finalized the row.
      this.logger.log(`practice.submit race-resolved attempt=${attemptId}`, 'Practice');
    } else {
      this.logger.log(
        `practice.submit userId=${userId} problem=${problemId} correct=${String(finalized.isCorrect)} time=${String(finalized.timeSpentSeconds)}s`,
        'Practice',
      );
    }
    if (finalized.isCorrect === true) {
      // Activity reward for a correct solve. Idempotent per submission and
      // daily-capped; best-effort so rewards never break submitting.
      void this.points
        .awardTrigger({
          userId,
          trigger: 'problem-solve',
          sourceType: 'submission',
          sourceId: attemptId,
        })
        .catch(() => undefined);
    }
    void this.analytics.record('practice.submitted', { userId, metadata: { problemId } });
    if (finalized.isCorrect === true) {
      void this.analytics.record('practice.solved', { userId, metadata: { problemId } });
    }
    return this.buildResult(finalized, userId);
  }

  /** Practice attempts may be abandoned freely; correctness is unaffected. */
  async abandonAttempt(userId: string, problemId: string, attemptId: string): Promise<void> {
    await this.prisma.submission.updateMany({
      where: { id: attemptId, userId, problemId, context: 'PRACTICE', status: 'STARTED' },
      data: { status: 'ABANDONED' },
    });
  }

  private async buildResult(
    attempt: {
      id: string;
      problemId: string;
      context: string;
      status: string;
      startedAt: Date;
      selectedOptionId: string | null;
      isCorrect: boolean | null;
      timeSpentSeconds: number | null;
    },
    userId: string,
  ): Promise<AttemptResultDto> {
    const [reveal, problem] = await Promise.all([
      this.prisma.problem.findUniqueOrThrow({
        where: { id: attempt.problemId },
        select: {
          explanation: true,
          shortcut: true,
          options: { where: { isCorrect: true }, select: { id: true }, take: 1 },
        },
      }),
      this.problems.getById(attempt.problemId, userId),
    ]);

    return {
      attempt: this.toAttemptDto(attempt),
      result: {
        selectedOptionId: attempt.selectedOptionId,
        correctOptionId: reveal.options[0]?.id ?? null,
        isCorrect: attempt.isCorrect ?? false,
        explanation: reveal.explanation,
        shortcut: reveal.shortcut,
        timeSpentSeconds: attempt.timeSpentSeconds,
      },
      problem,
    };
  }

  private toAttemptDto(attempt: {
    id: string;
    problemId: string;
    context: string;
    status: string;
    startedAt: Date;
  }): AttemptDto {
    return {
      id: attempt.id,
      problemId: attempt.problemId,
      context: attempt.context as AttemptDto['context'],
      status: attempt.status as AttemptDto['status'],
      startedAt: attempt.startedAt.toISOString(),
    };
  }

  private problemNotFound(): NotFoundException {
    return new NotFoundException({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Problem not found.',
    });
  }

  private attemptNotFound(): NotFoundException {
    // Ownership violations are indistinguishable from a missing attempt so
    // attempt ids cannot be probed across accounts.
    return new NotFoundException({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Attempt not found.',
    });
  }
}

export function computeTimeSpent(startedAt: Date, submittedAt: Date): number {
  const seconds = Math.floor((submittedAt.getTime() - startedAt.getTime()) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return 0;
  }
  return Math.min(seconds, MAX_PRACTICE_SECONDS);
}
