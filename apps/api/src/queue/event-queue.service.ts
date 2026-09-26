import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { NotificationType } from '@apteez/types';
import { getRequestId } from '../common/context/request-context';
import { AppLogger } from '../common/logger/app-logger';
import { EVENT_JOBS, EVENT_QUEUE, eventFanoutJobId, eventNotifyJobId } from './queue.constants';

/**
 * Typed façade over the event notification queue. Enqueue failures never fail
 * the request path — notifications are best-effort delivery over a durable
 * PostgreSQL inbox.
 */
@Injectable()
export class EventQueueService {
  constructor(
    @InjectQueue(EVENT_QUEUE) private readonly queue: Queue,
    private readonly logger: AppLogger,
  ) {}

  async notifyUser(params: {
    userId: string;
    type: NotificationType;
    title: string;
    body?: string | null;
    eventId?: string | null;
  }): Promise<void> {
    const jobId = eventNotifyJobId(params.eventId ?? 'global', params.userId, params.type);
    try {
      // attempts:1 — inbox rows carry no dedup key, so a processor retry
      // could double-deliver. Loss is acceptable: the inbox is informational
      // and producers never block on it.
      await this.queue.add(
        EVENT_JOBS.notify,
        { ...params, requestId: getRequestId() ?? undefined },
        { jobId, attempts: 1 },
      );
    } catch (error) {
      this.logger.warn(
        `queue.event-notify-failed user=${params.userId} ${error instanceof Error ? error.message : String(error)}`,
        'Queue',
      );
    }
  }

  async notifyParticipants(params: {
    eventId: string;
    type: NotificationType;
    title: string;
    body?: string | null;
  }): Promise<void> {
    const jobId = eventFanoutJobId(params.eventId, params.type);
    try {
      // attempts:1 for the same no-dedup-key reason as notifyUser; the
      // fanout handler itself pages deterministically, so a re-enqueue is
      // still safe to trigger manually from the payload.
      await this.queue.add(
        EVENT_JOBS.notifyParticipants,
        { ...params, requestId: getRequestId() ?? undefined },
        { jobId, attempts: 1 },
      );
    } catch (error) {
      this.logger.warn(
        `queue.event-fanout-failed event=${params.eventId} ${error instanceof Error ? error.message : String(error)}`,
        'Queue',
      );
    }
  }
}
