import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { getRequestId } from '../common/context/request-context';
import { AppLogger } from '../common/logger/app-logger';
import {
  CHALLENGE_JOBS,
  CHALLENGE_QUEUE,
  activateJobId,
  expireJobId,
  ratingJobId,
} from './queue.constants';

/**
 * Typed façade over the challenge job queue. Callers schedule work; they never
 * touch BullMQ directly. Every scheduler uses a deterministic job id so a
 * repeat call (retry, reconnect, duplicate request) is a no-op rather than a
 * second job.
 */
@Injectable()
export class ChallengeQueueService {
  constructor(
    @InjectQueue(CHALLENGE_QUEUE) private readonly queue: Queue,
    private readonly logger: AppLogger,
  ) {}

  /** Schedule COUNTDOWN → LIVE for a challenge at its server start time. */
  async scheduleActivation(challengeId: string, startAt: Date): Promise<void> {
    const delay = Math.max(0, startAt.getTime() - Date.now());
    await this.enqueue(CHALLENGE_JOBS.activate, { challengeId }, delay, activateJobId(challengeId));
  }

  /** Schedule finalization at the server end time (backstop for the live tick). */
  async scheduleExpiry(challengeId: string, endsAt: Date): Promise<void> {
    const delay = Math.max(0, endsAt.getTime() - Date.now());
    await this.enqueue(CHALLENGE_JOBS.expire, { challengeId }, delay, expireJobId(challengeId));
  }

  /**
   * Enqueue rating processing for a finalized challenge. The deterministic job
   * id means a retried or duplicated enqueue never stacks two jobs; the job
   * itself is idempotent regardless.
   */
  async enqueueRatingUpdate(challengeId: string): Promise<void> {
    await this.enqueue(CHALLENGE_JOBS.ratingUpdate, { challengeId }, 0, ratingJobId(challengeId));
  }

  /** Recurring matchmaking/live-state sweep (idempotent across workers). */
  async scheduleMatchmakingSweep(intervalMs: number): Promise<void> {
    await this.upsertScheduler('matchmaking_sweep', CHALLENGE_JOBS.matchmakingSweep, intervalMs);
  }

  async scheduleLiveStateCleanup(intervalMs: number): Promise<void> {
    await this.upsertScheduler(
      'challenge_live_state_cleanup',
      CHALLENGE_JOBS.liveStateCleanup,
      intervalMs,
    );
  }

  /**
   * Repeatable jobs in BullMQ 5 are declared through the `repeat` option on a
   * normal job. The deterministic `jobId` makes re-bootstrapping idempotent:
   * BullMQ keeps a single repeatable job per id rather than stacking copies.
   */
  private async upsertScheduler(
    schedulerId: string,
    jobName: string,
    intervalMs: number,
  ): Promise<void> {
    try {
      await this.queue.add(
        jobName,
        {},
        {
          repeat: { every: intervalMs },
          jobId: schedulerId,
          // Successful sweeps are noise; failed ones keep the global 24h
          // retention so on-call can inspect them.
          removeOnComplete: true,
        },
      );
    } catch (error) {
      this.logger.warn(
        `queue.scheduler-failed scheduler=${schedulerId} ${error instanceof Error ? error.message : String(error)}`,
        'Queue',
      );
    }
  }

  private async enqueue(
    name: string,
    payload: Record<string, unknown>,
    delay: number,
    jobId: string,
  ): Promise<void> {
    try {
      // Trace challenge lifecycle jobs back to the originating request.
      const requestId = getRequestId();
      await this.queue.add(name, requestId ? { ...payload, requestId } : payload, { delay, jobId });
    } catch (error) {
      // A failed enqueue must never crash the request path: the synchronous
      // live tick still drives state, and the sweep re-schedules leftovers.
      this.logger.warn(
        `queue.enqueue-failed job=${name} id=${jobId} ${error instanceof Error ? error.message : String(error)}`,
        'Queue',
      );
    }
  }
}
