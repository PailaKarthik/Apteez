import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { AppLogger } from '../../common/logger/app-logger';
import { CHALLENGE_QUEUE, EVENT_QUEUE } from '../../queue/queue.constants';
import { AI_QUEUE } from '../ai/ai.constants';
import { withTimeout } from '../../common/utils/with-timeout';

const PROBE_TIMEOUT_MS = 2000;

export interface QueueSnapshot {
  name: string;
  status: 'up' | 'down';
  waiting: number | null;
  active: number | null;
  delayed: number | null;
  failed: number | null;
  completed: number | null;
}

export interface FailedJobSummary {
  id: string | undefined;
  name: string;
  attemptsMade: number;
  failedReason: string | null;
  timestamp: number | null;
  dataPreview: string | null;
}

/**
 * Operational visibility for BullMQ. Read-only counts plus inspectable
 * failed-job summaries (payloads truncated, never full user content).
 * Retries stay bounded by the queue defaults; this surface lets on-call
 * find and re-drive failures instead of losing them silently.
 */
@Injectable()
export class AdminQueuesService {
  constructor(
    @InjectQueue(CHALLENGE_QUEUE) private readonly challengeQueue: Queue,
    @InjectQueue(EVENT_QUEUE) private readonly eventQueue: Queue,
    @InjectQueue(AI_QUEUE) private readonly aiQueue: Queue,
    private readonly logger: AppLogger,
  ) {}

  private queues(): Array<{ name: string; queue: Queue }> {
    return [
      { name: CHALLENGE_QUEUE, queue: this.challengeQueue },
      { name: EVENT_QUEUE, queue: this.eventQueue },
      { name: AI_QUEUE, queue: this.aiQueue },
    ];
  }

  async overview(): Promise<{ queues: QueueSnapshot[] }> {
    const snapshots: QueueSnapshot[] = [];
    for (const { name, queue } of this.queues()) {
      try {
        const counts = await withTimeout(
          queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed', 'paused'),
          PROBE_TIMEOUT_MS,
        );
        snapshots.push({
          name,
          status: 'up',
          waiting: counts.waiting + counts.paused,
          active: counts.active,
          delayed: counts.delayed,
          failed: counts.failed,
          completed: counts.completed,
        });
      } catch (error) {
        this.logger.warn(
          `admin.queues-unavailable queue=${name} ${error instanceof Error ? error.message : String(error)}`,
          'Admin',
        );
        snapshots.push({
          name,
          status: 'down',
          waiting: null,
          active: null,
          delayed: null,
          failed: null,
          completed: null,
        });
      }
    }
    return { queues: snapshots };
  }

  async failed(
    queueName: string,
    limit = 20,
  ): Promise<{ queue: string; jobs: FailedJobSummary[] }> {
    const entry = this.queues().find((q) => q.name === queueName);
    if (!entry) {
      return { queue: queueName, jobs: [] };
    }
    const capped = Math.min(Math.max(limit, 1), 50);
    const jobs = await withTimeout(entry.queue.getFailed(0, capped - 1), PROBE_TIMEOUT_MS);
    return {
      queue: queueName,
      jobs: jobs.map((job) => ({
        id: job.id,
        name: job.name,
        attemptsMade: job.attemptsMade,
        failedReason: typeof job.failedReason === 'string' ? job.failedReason.slice(0, 500) : null,
        timestamp: job.timestamp ?? null,
        dataPreview: JSON.stringify(job.data ?? null).slice(0, 500),
      })),
    };
  }

  async retryFailed(queueName: string, jobId: string): Promise<{ retried: boolean }> {
    const entry = this.queues().find((q) => q.name === queueName);
    if (!entry) {
      return { retried: false };
    }
    const job = await withTimeout(entry.queue.getJob(jobId), PROBE_TIMEOUT_MS);
    if (!job) {
      return { retried: false };
    }
    await job.retry();
    return { retried: true };
  }
}
