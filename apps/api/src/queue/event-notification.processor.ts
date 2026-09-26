import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import type { NotificationType } from '@apteez/types';
import { PrismaService } from '@apteez/database';
import { runWithJobRequestId } from '../common/context/request-context';
import { AppLogger } from '../common/logger/app-logger';
import { EVENT_JOBS, EVENT_QUEUE } from './queue.constants';

interface NotifyJob {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  eventId?: string | null;
  requestId?: string;
}

interface FanoutJob {
  eventId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  requestId?: string;
}

/**
 * Persists notification inbox rows. Delivery is best-effort: jobs are
 * enqueued with attempts:1 (see EventQueueService — inbox rows carry no
 * dedup key, so a processor retry could double-deliver), and the event APIs
 * never block on it. Transient queue failures drop the inbox row; the event
 * state itself is unaffected.
 */
@Processor(EVENT_QUEUE)
export class EventNotificationProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {
    super();
  }

  async process(job: Job<NotifyJob | FanoutJob>): Promise<void> {
    return runWithJobRequestId(job.data, () => this.dispatch(job));
  }

  private async dispatch(job: Job<NotifyJob | FanoutJob>): Promise<void> {
    try {
      if (job.name === EVENT_JOBS.notify) {
        await this.handleNotify(job as Job<NotifyJob>);
        return;
      }
      if (job.name === EVENT_JOBS.notifyParticipants) {
        await this.handleFanout(job as Job<FanoutJob>);
        return;
      }
      this.logger.warn(`event.job.unknown name=${job.name}`, 'Events');
    } catch (error) {
      this.logger.warn(
        `event.job.failed name=${job.name} job=${job.id ?? 'unknown'} attempts=${job.attemptsMade} ${error instanceof Error ? error.message : String(error)}`,
        'Events',
      );
      throw error;
    }
  }

  private async handleNotify(job: Job<NotifyJob>): Promise<void> {
    const { userId, type, title, body, eventId } = job.data;
    if (!userId || !type || !title) {
      return;
    }
    await this.prisma.notification.create({
      data: {
        userId,
        type,
        title: title.slice(0, 200),
        body: body?.slice(0, 2000) ?? null,
        eventId: eventId ?? null,
      },
    });
  }

  private async handleFanout(job: Job<FanoutJob>): Promise<void> {
    const { eventId, type, title, body } = job.data;
    if (!eventId || !type || !title) {
      this.logger.warn(`event.job.invalid name=${job.name} job=${job.id ?? 'unknown'}`, 'Events');
      return;
    }
    // Paginated fanout: events larger than one page are fully covered
    // instead of silently truncated, and each page is its own bounded write.
    const PAGE = 1000;
    let skip = 0;
    for (;;) {
      const participants = await this.prisma.eventParticipant.findMany({
        where: { eventId, status: { in: ['REGISTERED', 'ACTIVE', 'SUBMITTED', 'AUTO_SUBMITTED'] } },
        orderBy: [{ userId: 'asc' }],
        select: { userId: true },
        skip,
        take: PAGE,
      });
      if (participants.length === 0) {
        return;
      }
      await this.prisma.notification.createMany({
        data: participants.map((p) => ({
          userId: p.userId,
          type,
          title: title.slice(0, 200),
          body: body?.slice(0, 2000) ?? null,
          eventId,
        })),
        // NOTE: notifications has no unique constraint, so skipDuplicates is
        // a no-op here. Fanout jobs run attempts:1; a manual re-enqueue may
        // double-deliver, which is acceptable for informational inbox rows.
        skipDuplicates: true,
      });
      if (participants.length < PAGE) {
        return;
      }
      skip += PAGE;
    }
  }
}
