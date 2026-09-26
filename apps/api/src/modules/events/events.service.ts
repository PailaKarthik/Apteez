import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@apteez/database';
import type {
  EventDetailDto,
  EventLeaderboardEntryDto,
  EventParticipantDto,
  EventResultDto,
  EventSessionDto,
  EventSummaryDto,
  PaginatedData,
} from '@apteez/types';
import type {
  EventAnswerInput,
  EventCreateInput,
  EventInviteInput,
  EventLeaderboardQuery,
  EventListQuery,
  EventParticipantsQuery,
  EventReviewInput,
  EventTransitionInput,
  EventUpdateInput,
} from '@apteez/validation';
import { AppLogger } from '../../common/logger/app-logger';
import { RedisService } from '../../redis/redis.service';
import { redisKeys } from '../../redis/redis-keys';
import { RedisLockService } from '../../redis/redis-lock.service';
import { StorageService } from '../../storage/storage.service';
import { EventQueueService } from '../../queue/event-queue.service';
import { PointsService } from '../rewards/points.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { AuthRequiredError } from '../auth/auth.errors';
import {
  EventExpiredError,
  EventForbiddenError,
  EventNotFoundError,
  EventNotRegisteredError,
  EventQuestionError,
  EventRegistrationError,
  EventStateError,
  EventValidationError,
} from './events.errors';
import {
  assertNoActiveContent,
  canTransitionEvent,
  isParticipableStatus,
  slugifyEventTitle,
} from './events.util';

const FINALIZE_LOCK_TTL_MS = 10_000;
const CLOSE_LOCK_TTL_MS = 30_000;
const REGISTER_LOCK_TTL_MS = 5_000;
const LIST_CACHE_TTL_S = 30;

interface Caller {
  id: string;
  roles: string[];
  permissions: string[];
}

export interface EventRow {
  id: string;
  organizerId: string | null;
  organizationId: string | null;
  title: string;
  slug: string;
  description: string;
  bannerKey: string | null;
  eventType: EventSummaryDto['eventType'];
  visibility: EventSummaryDto['visibility'];
  status: EventSummaryDto['status'];
  isOfficial: boolean;
  entryCode: string | null;
  difficulty: EventSummaryDto['difficulty'];
  maxParticipants: number | null;
  registrationStartAt: Date | null;
  registrationEndAt: Date | null;
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  isPaid: boolean;
  price: number | null;
  rules: string | null;
  questionCount: number;
  participantCount: number;
  publishedAt: Date | null;
  cancelledAt: Date | null;
  organizer: { displayName: string } | null;
  organization: { id: string; name: string } | null;
  _count: { participants: number };
}

interface ParticipantRow {
  id: string;
  eventId: string;
  userId: string;
  status: EventSessionDto['participantStatus'];
  registeredAt: Date;
  joinedAt: Date | null;
  effectiveEndAt: Date | null;
  completedAt: Date | null;
  submittedAt: Date | null;
  lastSeenAt: Date | null;
  currentPosition: number;
  score: number | null;
  rank: number | null;
}

interface EventQuestionRow {
  id: string;
  eventId: string;
  order: number;
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

/** Server-authoritative event engine; clients never supply state, scores or ranks. */
@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lock: RedisLockService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
    private readonly eventQueue: EventQueueService,
    private readonly points: PointsService,
    private readonly analytics: AnalyticsService,
    private readonly logger: AppLogger,
  ) {}

  // ─── Discovery ──────────────────────────────────────────────────────────

  async list(query: EventListQuery, caller?: Caller): Promise<PaginatedData<EventSummaryDto>> {
    // Advance due statuses before filtering: otherwise the live tab can only
    // ever fill when somebody opens each event's detail page first.
    await this.sweepEventStatuses();
    const cacheKey = this.listCacheKey(query, caller);
    if (!caller && cacheKey) {
      const cached = await this.cacheGet<PaginatedData<EventSummaryDto>>(cacheKey);
      if (cached) {
        return cached;
      }
    }
    const where = await this.buildListWhere(query, caller);
    const [total, rows] = await Promise.all([
      this.prisma.event.count({ where }),
      this.prisma.event.findMany({
        where,
        orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          organizer: { select: { displayName: true } },
          organization: { select: { id: true, name: true } },
          _count: { select: { participants: true } },
        },
      }),
    ]);
    const registered = await this.registeredSet(
      (rows as EventRow[]).map((r) => r.id),
      caller?.id,
    );
    const page: PaginatedData<EventSummaryDto> = {
      items: (rows as EventRow[]).map((r) => this.toSummary(r, registered.has(r.id))),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
    if (!caller && cacheKey) {
      await this.cacheSet(cacheKey, page, LIST_CACHE_TTL_S);
    }
    return page;
  }

  private async buildListWhere(
    query: EventListQuery,
    caller?: Caller,
  ): Promise<Prisma.EventWhereInput> {
    const now = new Date();
    const where: Prisma.EventWhereInput = {};
    // Phase buckets derive from status + timestamps (backend authoritative).
    if (query.phase === 'live') {
      where.status = 'LIVE';
    } else if (query.phase === 'upcoming') {
      where.status = { in: ['PUBLISHED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED'] };
    } else if (query.phase === 'past') {
      where.status = { in: ['COMPLETED', 'ARCHIVED'] };
    } else if (query.phase === 'active') {
      where.status = { in: ['REGISTRATION_OPEN', 'LIVE'] };
    } else if (query.phase === 'mine') {
      if (!caller) {
        throw new AuthRequiredError('Sign in to view your events.');
      }
      where.OR = [{ organizerId: caller.id }, { participants: { some: { userId: caller.id } } }];
    } else if (!this.isAdmin(caller)) {
      // Default public discovery hides drafts/cancelled.
      where.status = {
        in: [
          'PUBLISHED',
          'REGISTRATION_OPEN',
          'REGISTRATION_CLOSED',
          'LIVE',
          'COMPLETED',
          'ARCHIVED',
        ],
      };
    }
    if (query.eventType) {
      where.eventType = query.eventType;
    }
    if (query.origin === 'official') {
      where.isOfficial = true;
    } else if (query.origin === 'community') {
      where.isOfficial = false;
    }
    if (query.difficulty) {
      where.difficulty = query.difficulty;
    }
    if (query.organizationId) {
      where.organizationId = query.organizationId;
    }
    if (query.freeOnly) {
      where.isPaid = false;
    }
    if (query.from || query.to) {
      where.startAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }
    if (query.q) {
      const q = query.q.trim().slice(0, 120);
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        },
      ];
    }
    // Visibility scoping: anonymous + plain members see public/community plus
    // org events they belong to; private/university rows are filtered post-query
    // when membership cannot be expressed in a single WHERE (see below).
    if (query.visibility) {
      if (query.visibility !== 'PUBLIC' && query.visibility !== 'COMMUNITY' && !caller) {
        throw new EventForbiddenError('Sign in to browse restricted events.');
      }
      where.visibility = query.visibility;
    } else if (!caller) {
      where.visibility = { in: ['PUBLIC', 'COMMUNITY'] };
    }
    void now;
    return where;
  }

  // ─── Detail ─────────────────────────────────────────────────────────────

  async detail(idOrSlug: string, caller?: Caller): Promise<EventDetailDto> {
    const event = await this.requireEvent(idOrSlug);
    await this.assertVisible(event, caller);
    const participant = caller ? await this.findParticipant(event.id, caller.id) : null;
    const canManage = this.canManage(event, caller);
    const restriction = await this.registrationRestriction(
      event,
      caller,
      participant?.status ?? null,
    );
    const bannerUrl = event.bannerKey ? await this.storage.getDownloadUrl(event.bannerKey) : null;
    const bypass = caller ? await this.eventBypass(event, caller) : false;
    const codeLocked =
      (event.visibility === 'PRIVATE' || event.visibility === 'UNIVERSITY') &&
      Boolean(event.entryCode) &&
      Boolean(caller) &&
      !canManage &&
      !bypass;
    let organizationIsMember = false;
    if (caller && event.visibility === 'UNIVERSITY' && event.organizationId) {
      const membership = await this.prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: { organizationId: event.organizationId, userId: caller.id },
        },
      });
      organizationIsMember = Boolean(membership);
    }
    return {
      ...this.toSummary(event, Boolean(participant)),
      bannerKey: event.bannerKey,
      bannerUrl,
      rules: event.rules,
      canManage,
      canRegister: restriction === null && !participant,
      registrationRestriction: restriction,
      requiresCode: codeLocked,
      organizationIsMember,
      entryCode: canManage ? (event.entryCode ?? null) : null,
      participant: participant
        ? {
            status: participant.status,
            registeredAt: participant.registeredAt.toISOString(),
            joinedAt: participant.joinedAt?.toISOString() ?? null,
            completedAt: participant.completedAt?.toISOString() ?? null,
            score: participant.score,
            rank: participant.rank,
          }
        : null,
    };
  }

  // ─── Creation / editing ─────────────────────────────────────────────────

  async create(input: EventCreateInput, caller: Caller): Promise<EventDetailDto> {
    // Any signed-in user may create: admins mint official events, everyone
    // else mints community events (always DRAFT until published).
    assertNoActiveContent(input.title, 'title');
    assertNoActiveContent(input.description, 'description');
    assertNoActiveContent(input.rules ?? null, 'rules');
    if (input.isPaid) {
      // Paid-event readiness: schema accepts the shape, processing is deferred.
      throw new EventValidationError('Paid events are not enabled yet. Create a free event.');
    }
    if (input.organizationId) {
      // Hosting for an organization makes you a member of it — membership
      // is open-join anyway, so this never blocks creation, it just keeps
      // the organizer roster truthful.
      await this.ensureOrgMembership(input.organizationId, caller);
    }
    const problemIds = [...new Set(input.problemIds)];
    if (problemIds.length > 0) {
      await this.assertProblemsUsable(problemIds);
    }
    const slug = await this.uniqueSlug(input.slug?.trim() || slugifyEventTitle(input.title));
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    const created = await this.prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          organizerId: caller.id,
          organizationId: input.organizationId ?? null,
          title: input.title.trim(),
          slug,
          description: input.description.trim(),
          bannerKey: input.bannerKey ?? null,
          eventType: input.eventType,
          visibility: input.visibility,
          status: 'DRAFT',
          isOfficial: this.isAdmin(caller),
          entryCode: input.entryCode?.trim() || null,
          difficulty: input.difficulty,
          maxParticipants: input.maxParticipants ?? null,
          registrationStartAt: input.registrationStartAt
            ? new Date(input.registrationStartAt)
            : null,
          registrationEndAt: input.registrationEndAt ? new Date(input.registrationEndAt) : null,
          startAt,
          endAt,
          durationMinutes: input.durationMinutes,
          isPaid: false,
          price: null,
          rules: input.rules?.trim() ?? null,
          questionCount: problemIds.length,
        },
      });
      if (problemIds.length > 0) {
        await tx.eventQuestion.createMany({
          data: problemIds.map((problemId, index) => ({
            eventId: event.id,
            problemId,
            order: index,
            points: 1,
          })),
        });
      }
      await tx.eventAudit.create({
        data: { eventId: event.id, actorId: caller.id, action: 'event.created', detail: slug },
      });
      return event;
    });
    await this.invalidateEventCache(created.id);
    return this.detail(created.id, caller);
  }

  async update(id: string, input: EventUpdateInput, caller: Caller): Promise<EventDetailDto> {
    const event = await this.requireEvent(id);
    this.requireManager(event, caller);
    assertNoActiveContent(input.title ?? null, 'title');
    assertNoActiveContent(input.description ?? null, 'description');
    assertNoActiveContent(input.rules ?? null, 'rules');
    const editableAfterPublish = [
      'title',
      'description',
      'rules',
      'bannerKey',
      'maxParticipants',
      'entryCode',
    ] as const;
    if (event.status !== 'DRAFT') {
      const keys = Object.keys(input).filter(
        (k) => (input as Record<string, unknown>)[k] !== undefined,
      );
      const forbidden = keys.filter(
        (k) => !(editableAfterPublish as readonly string[]).includes(k),
      );
      if (forbidden.length > 0) {
        throw new EventStateError(
          `Only ${editableAfterPublish.join(', ')} can be edited after draft.`,
        );
      }
    }
    if (
      input.maxParticipants !== undefined &&
      input.maxParticipants !== null &&
      event.maxParticipants !== null
    ) {
      const active = await this.prisma.eventParticipant.count({
        where: { eventId: event.id, status: { in: ['REGISTERED', 'ACTIVE'] } },
      });
      if (input.maxParticipants < active) {
        throw new EventValidationError(
          'Capacity cannot drop below the current registration count.',
        );
      }
    }
    if (input.problemIds && event.status !== 'DRAFT') {
      throw new EventStateError('Questions can only be changed while the event is a draft.');
    }
    if (input.problemIds) {
      const ids = [...new Set(input.problemIds)];
      if (ids.length > 0) {
        await this.assertProblemsUsable(ids);
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.eventQuestion.deleteMany({ where: { eventId: event.id } });
        if (ids.length > 0) {
          await tx.eventQuestion.createMany({
            data: ids.map((problemId, index) => ({
              eventId: event.id,
              problemId,
              order: index,
              points: 1,
            })),
          });
        }
        await tx.event.update({ where: { id: event.id }, data: { questionCount: ids.length } });
      });
    }
    const { problemIds: _omit, ...rest } = input;
    void _omit;
    await this.prisma.event.update({
      where: { id: event.id },
      data: {
        ...(rest.title !== undefined ? { title: rest.title.trim() } : {}),
        ...(rest.description !== undefined ? { description: rest.description.trim() } : {}),
        ...(rest.rules !== undefined ? { rules: rest.rules?.trim() ?? null } : {}),
        ...(rest.bannerKey !== undefined ? { bannerKey: rest.bannerKey } : {}),
        ...(rest.maxParticipants !== undefined ? { maxParticipants: rest.maxParticipants } : {}),
        ...(rest.entryCode !== undefined
          ? { entryCode: rest.entryCode?.trim() ? rest.entryCode.trim() : null }
          : {}),
        ...(event.status === 'DRAFT'
          ? {
              ...(rest.eventType !== undefined ? { eventType: rest.eventType } : {}),
              ...(rest.visibility !== undefined ? { visibility: rest.visibility } : {}),
              ...(rest.organizationId !== undefined ? { organizationId: rest.organizationId } : {}),
              ...(rest.difficulty !== undefined ? { difficulty: rest.difficulty } : {}),
              ...(rest.registrationStartAt !== undefined
                ? {
                    registrationStartAt: rest.registrationStartAt
                      ? new Date(rest.registrationStartAt)
                      : null,
                  }
                : {}),
              ...(rest.registrationEndAt !== undefined
                ? {
                    registrationEndAt: rest.registrationEndAt
                      ? new Date(rest.registrationEndAt)
                      : null,
                  }
                : {}),
              ...(rest.startAt !== undefined ? { startAt: new Date(rest.startAt) } : {}),
              ...(rest.endAt !== undefined ? { endAt: new Date(rest.endAt) } : {}),
              ...(rest.durationMinutes !== undefined
                ? { durationMinutes: rest.durationMinutes }
                : {}),
            }
          : {}),
      },
    });
    await this.prisma.eventAudit.create({
      data: { eventId: event.id, actorId: caller.id, action: 'event.updated' },
    });
    await this.invalidateEventCache(event.id);
    return this.detail(event.id, caller);
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  async transition(
    id: string,
    input: EventTransitionInput,
    caller: Caller,
  ): Promise<EventDetailDto> {
    const event = await this.requireEvent(id);
    this.requireManager(event, caller);
    const to = input.to;
    if (!canTransitionEvent(event.status, to)) {
      throw new EventStateError(`Cannot move event from ${event.status} to ${to}.`);
    }
    if ((to === 'PUBLISHED' || to === 'REGISTRATION_OPEN') && event.status === 'DRAFT') {
      await this.assertPublishable(event.id);
    }
    const now = new Date();
    await this.prisma.event.update({
      where: { id: event.id },
      data: {
        status: to,
        ...(to === 'PUBLISHED' || to === 'REGISTRATION_OPEN' ? { publishedAt: now } : {}),
        ...(to === 'CANCELLED' ? { cancelledAt: now } : {}),
        ...(to === 'ARCHIVED' ? { archivedAt: now } : {}),
      },
    });
    // Authoritative auto-progression hooks: entering LIVE stamps nothing per
    // participant (join is lazy); entering COMPLETED recomputes ranks.
    if (to === 'COMPLETED') {
      await this.assignRanks(event.id);
    }
    await this.prisma.eventAudit.create({
      data: { eventId: event.id, actorId: caller.id, action: `event.transition:${to}` },
    });
    await this.invalidateEventCache(event.id);
    // Async fan-out; never blocks the transition response.
    if (to === 'CANCELLED') {
      void this.eventQueue
        .notifyParticipants({
          eventId: event.id,
          type: 'EVENT_CANCELLED',
          title: `Event cancelled: ${event.title}`,
          body: 'The organizer cancelled this event.',
        })
        .catch(() => undefined);
    } else if (to === 'LIVE' || to === 'REGISTRATION_OPEN') {
      void this.eventQueue
        .notifyParticipants({
          eventId: event.id,
          type: to === 'LIVE' ? 'EVENT_STARTED' : 'EVENT_UPDATED',
          title:
            to === 'LIVE' ? `Event is live: ${event.title}` : `Registration open: ${event.title}`,
        })
        .catch(() => undefined);
    } else if (to === 'COMPLETED') {
      void this.eventQueue
        .notifyParticipants({
          eventId: event.id,
          type: 'EVENT_RESULTS_PUBLISHED',
          title: `Results published: ${event.title}`,
        })
        .catch(() => undefined);
    }
    return this.detail(event.id, caller);
  }

  private async assertPublishable(eventId: string): Promise<void> {
    const event = (await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { _count: { select: { questions: true } } },
    })) as (EventRow & { _count: { questions: number } }) | null;
    if (!event) {
      throw new EventNotFoundError();
    }
    const missing: string[] = [];
    if (!event.description || event.description.trim().length < 20) {
      missing.push('description');
    }
    if (event._count.questions === 0) {
      missing.push('questions');
    }
    if (!(event.startAt < event.endAt)) {
      missing.push('schedule');
    }
    if (missing.length > 0) {
      throw new EventValidationError(`Cannot publish: missing ${missing.join(', ')}.`);
    }
  }

  // ─── Registration (transactional, race-safe) ────────────────────────────

  async register(
    id: string,
    caller: Caller,
    code?: string | null,
  ): Promise<{ registered: boolean; status: string }> {
    const event = await this.requireEvent(id);
    // Serialize capacity checks per event; the unique constraint is the final guard.
    const result = await this.lock.withLock(
      `event-register:${event.id}`,
      REGISTER_LOCK_TTL_MS,
      async () => this.registerInner(event, caller, code),
    );
    if (result === null) {
      // Another worker is registering concurrently — re-read for idempotency.
      const existing = await this.findParticipant(event.id, caller.id);
      if (existing) {
        return { registered: true, status: existing.status };
      }
      throw new EventRegistrationError('Registration is busy. Please retry.');
    }
    return result;
  }

  private async registerInner(
    event: EventRow,
    caller: Caller,
    code?: string | null,
  ): Promise<{ registered: boolean; status: string }> {
    this.assertRegistrationOpen(event);
    await this.assertEventAccess(event, caller, 'register', code);
    const existing = await this.findParticipant(event.id, caller.id);
    if (existing) {
      if (existing.status === 'WITHDRAWN') {
        // Re-registration re-enters the capacity check below.
        await this.prisma.eventParticipant.delete({ where: { id: existing.id } });
      } else {
        return { registered: true, status: existing.status };
      }
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        if (event.maxParticipants !== null) {
          // Capacity check and insert share one transaction serialized on
          // the event row: without the lock, concurrent registrations can
          // both pass the count check and overbook (TOCTOU).
          await tx.$queryRaw`SELECT "id" FROM "events" WHERE "id" = ${event.id}::uuid FOR UPDATE`;
          const count = await tx.eventParticipant.count({
            where: {
              eventId: event.id,
              status: { in: ['REGISTERED', 'ACTIVE', 'SUBMITTED', 'AUTO_SUBMITTED'] },
            },
          });
          if (count >= event.maxParticipants) {
            throw new EventRegistrationError('This event is full.');
          }
        }
        await tx.eventParticipant.create({
          data: { eventId: event.id, userId: caller.id, status: 'REGISTERED' },
        });
        await tx.event.update({
          where: { id: event.id },
          data: { participantCount: { increment: 1 } },
        });
      });
    } catch (error) {
      if (error instanceof EventRegistrationError) {
        throw error;
      }
      if (this.isUniqueViolation(error)) {
        return { registered: true, status: 'REGISTERED' };
      }
      throw error;
    }
    await this.invalidateEventCache(event.id);
    void this.eventQueue
      .notifyUser({
        userId: caller.id,
        type: 'EVENT_REGISTERED',
        title: `Registered: ${event.title}`,
        body: 'Your registration was confirmed.',
        eventId: event.id,
      })
      .catch(() => undefined);
    // Fresh registration only: idempotent replays return above.
    void this.analytics.record('event.registered', {
      userId: caller.id,
      metadata: { eventId: event.id },
    });
    return { registered: true, status: 'REGISTERED' };
  }

  async withdraw(id: string, caller: Caller): Promise<{ registered: boolean }> {
    const event = await this.requireEvent(id);
    const participant = await this.findParticipant(event.id, caller.id);
    if (!participant) {
      return { registered: false };
    }
    if (participant.status !== 'REGISTERED' && participant.status !== 'WAITLISTED') {
      throw new EventStateError('You can only withdraw before entering the event.');
    }
    if (new Date() >= event.startAt && event.status === 'LIVE') {
      throw new EventStateError('Withdrawal closed after the event started.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.eventParticipant.delete({ where: { id: participant.id } });
      await tx.event.update({
        where: { id: event.id },
        data: { participantCount: { decrement: 1 } },
      });
    });
    await this.invalidateEventCache(event.id);
    void this.eventQueue
      .notifyUser({
        userId: caller.id,
        type: 'EVENT_WITHDRAWN',
        title: `Withdrawn: ${event.title}`,
        eventId: event.id,
      })
      .catch(() => undefined);
    return { registered: false };
  }

  // ─── Live participation (reuses contest engine shape) ───────────────────

  async join(id: string, caller: Caller, code?: string | null): Promise<EventSessionDto> {
    const event = await this.requireEvent(id);
    this.assertParticipable(event);
    await this.assertEventAccess(event, caller, 'participate', code);
    const participant = await this.requireParticipant(event.id, caller.id);
    const now = new Date();
    if (now >= event.endAt) {
      await this.finalizeParticipant(event.id, caller.id, true);
      throw new EventExpiredError();
    }
    if (now < event.startAt && event.status !== 'LIVE') {
      throw new EventStateError('The event has not started yet.');
    }
    if (!participant.joinedAt || !participant.effectiveEndAt) {
      const effectiveEndAt = new Date(
        Math.min(event.endAt.getTime(), now.getTime() + event.durationMinutes * 60_000),
      );
      await this.prisma.eventParticipant.update({
        where: { id: participant.id },
        data: { status: 'ACTIVE', joinedAt: now, effectiveEndAt, lastSeenAt: now },
      });
    } else {
      await this.prisma.eventParticipant.update({
        where: { id: participant.id },
        data: {
          status: participant.status === 'REGISTERED' ? 'ACTIVE' : undefined,
          lastSeenAt: now,
        },
      });
    }
    return this.session(event.id, caller);
  }

  async session(id: string, caller: Caller): Promise<EventSessionDto> {
    const event = await this.requireEvent(id);
    const participant = await this.requireParticipant(event.id, caller.id);
    if (!participant.joinedAt || !participant.effectiveEndAt) {
      throw new EventNotRegisteredError('Join the event to start your session.');
    }
    const now = new Date();
    if (
      participant.status === 'ACTIVE' &&
      (now >= participant.effectiveEndAt || now >= event.endAt)
    ) {
      await this.finalizeParticipant(event.id, caller.id, true);
      return this.session(event.id, caller);
    }
    await this.prisma.eventParticipant.update({
      where: { id: participant.id },
      data: { lastSeenAt: now },
    });
    const questions = await this.loadQuestions(event.id);
    const answers = await this.prisma.eventAnswer.findMany({
      where: { participantId: participant.id },
      select: { eventQuestionId: true, selectedOptionId: true, markedForReview: true },
    });
    const byQuestion = new Map(answers.map((a) => [a.eventQuestionId, a]));
    const currentPosition = Math.min(
      Math.max(0, participant.currentPosition),
      Math.max(0, questions.length - 1),
    );
    const finalized = participant.status === 'SUBMITTED' || participant.status === 'AUTO_SUBMITTED';
    const reveal = finalized || event.status === 'COMPLETED';
    const urls = await this.resolveOptionUrls(questions);
    const completed = event.status === 'COMPLETED' || event.status === 'ARCHIVED';
    const items = questions.map((q, index) => {
      const answer = byQuestion.get(q.id);
      let state: 'unanswered' | 'answered' | 'review' | 'current' = 'unanswered';
      if (index === currentPosition) {
        state = 'current';
      } else if (answer?.markedForReview) {
        state = 'review';
      } else if (answer?.selectedOptionId) {
        state = 'answered';
      }
      const item: EventSessionDto['questions'][number] = {
        position: q.order,
        questionId: q.id,
        state,
      };
      if (reveal || completed) {
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
        answerable:
          !finalized &&
          now < participant.effectiveEndAt! &&
          now < event.endAt &&
          event.status === 'LIVE',
        reveal: reveal || completed,
      },
      urls,
    );
    const remaining = finalized
      ? 0
      : Math.max(
          0,
          Math.ceil(
            (Math.min(participant.effectiveEndAt!.getTime(), event.endAt.getTime()) -
              now.getTime()) /
              1000,
          ),
        );
    const refreshed = await this.findParticipant(event.id, caller.id);
    return {
      eventId: event.id,
      status: event.status,
      participantStatus: refreshed?.status ?? participant.status,
      serverTime: now.toISOString(),
      startsAt: event.startAt.toISOString(),
      endsAt: event.endAt.toISOString(),
      startedAt: participant.joinedAt!.toISOString(),
      effectiveEndAt: participant.effectiveEndAt!.toISOString(),
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

  async answer(
    id: string,
    questionId: string,
    caller: Caller,
    input: EventAnswerInput,
  ): Promise<{ saved: boolean; answeredCount: number; reviewCount: number }> {
    const guard = await this.requireAnswerable(id, caller.id, questionId);
    const option = guard.question.problem.options.find((o) => o.id === input.selectedOptionId);
    if (!option) {
      throw new EventQuestionError('That option does not belong to this question.');
    }
    await this.prisma.eventAnswer.upsert({
      where: {
        eventQuestionId_participantId: {
          eventQuestionId: guard.question.id,
          participantId: guard.participant.id,
        },
      },
      update: { selectedOptionId: input.selectedOptionId, answeredAt: new Date() },
      create: {
        eventId: id,
        participantId: guard.participant.id,
        eventQuestionId: guard.question.id,
        userId: caller.id,
        selectedOptionId: input.selectedOptionId,
      },
    });
    if (typeof input.currentPosition === 'number') {
      await this.prisma.eventParticipant.update({
        where: { id: guard.participant.id },
        data: { currentPosition: input.currentPosition, lastSeenAt: new Date() },
      });
    }
    return this.answerCounts(guard.participant.id);
  }

  async review(
    id: string,
    questionId: string,
    caller: Caller,
    input: EventReviewInput,
  ): Promise<{ saved: boolean; answeredCount: number; reviewCount: number }> {
    const guard = await this.requireAnswerable(id, caller.id, questionId);
    await this.prisma.eventAnswer.upsert({
      where: {
        eventQuestionId_participantId: {
          eventQuestionId: guard.question.id,
          participantId: guard.participant.id,
        },
      },
      update: { markedForReview: input.markedForReview },
      create: {
        eventId: id,
        participantId: guard.participant.id,
        eventQuestionId: guard.question.id,
        userId: caller.id,
        markedForReview: input.markedForReview,
      },
    });
    if (typeof input.currentPosition === 'number') {
      await this.prisma.eventParticipant.update({
        where: { id: guard.participant.id },
        data: { currentPosition: input.currentPosition, lastSeenAt: new Date() },
      });
    }
    return this.answerCounts(guard.participant.id);
  }

  async submitPreview(id: string, caller: Caller) {
    const event = await this.requireEvent(id);
    const participant = await this.requireParticipant(event.id, caller.id);
    const questions = await this.loadQuestions(event.id);
    const answers = await this.prisma.eventAnswer.findMany({
      where: { participantId: participant.id },
      select: { selectedOptionId: true, markedForReview: true },
    });
    const answeredCount = answers.filter((a) => a.selectedOptionId).length;
    const reviewCount = answers.filter((a) => a.markedForReview).length;
    return {
      answeredCount,
      unansweredCount: Math.max(0, questions.length - answeredCount),
      reviewCount,
      totalQuestions: questions.length,
    };
  }

  async submit(id: string, caller: Caller): Promise<EventResultDto> {
    return this.finalizeParticipant(id, caller.id, false);
  }

  async result(id: string, caller: Caller): Promise<EventResultDto> {
    const event = await this.requireEvent(id);
    const participant = await this.requireParticipant(event.id, caller.id);
    const result = await this.prisma.eventResult.findUnique({
      where: { participantId: participant.id },
    });
    if (!result) {
      throw new EventStateError('No result yet. Submit the event first.');
    }
    return this.toResult(event.id, participant, result);
  }

  async leaderboard(
    id: string,
    query: EventLeaderboardQuery,
    caller?: Caller,
  ): Promise<PaginatedData<EventLeaderboardEntryDto>> {
    const event = await this.requireEvent(id);
    const isLive = event.status === 'LIVE' && new Date() < event.endAt;
    // Private leaderboards stay restricted; public ones are open (anonymized live).
    if (event.visibility === 'PRIVATE' || event.visibility === 'UNIVERSITY') {
      if (!(await this.eventBypass(event, caller))) {
        throw new EventForbiddenError('This leaderboard is restricted.');
      }
    } else if (event.status === 'DRAFT') {
      throw new EventNotFoundError();
    }
    const total = await this.prisma.eventResult.count({ where: { eventId: event.id } });
    const rows = await this.prisma.eventResult.findMany({
      where: { eventId: event.id },
      orderBy: [
        { rank: 'asc' },
        { score: 'desc' },
        { completionSeconds: 'asc' },
        { userId: 'asc' },
      ],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        user: { select: { username: true, displayName: true, avatarKey: true, institution: true } },
      },
    });
    return {
      items: rows.map((r, index) => ({
        rank: r.rank ?? (query.page - 1) * query.pageSize + index + 1,
        userId: r.userId,
        username: isLive ? null : r.user.username,
        displayName: isLive
          ? `Participant ${(query.page - 1) * query.pageSize + index + 1}`
          : r.user.displayName,
        avatarKey: isLive ? null : r.user.avatarKey,
        institution: isLive ? null : r.user.institution,
        score: r.score,
        correctCount: r.correctCount,
        wrongCount: r.wrongCount,
        completionSeconds: r.completionSeconds,
        isCurrentUser: caller?.id === r.userId,
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  // ─── Organizer: participants / invites / questions ──────────────────────

  async participants(
    id: string,
    query: EventParticipantsQuery,
    caller: Caller,
  ): Promise<PaginatedData<EventParticipantDto>> {
    const event = await this.requireEvent(id);
    this.requireManager(event, caller);
    const total = await this.prisma.eventParticipant.count({ where: { eventId: event.id } });
    const rows = await this.prisma.eventParticipant.findMany({
      where: { eventId: event.id },
      orderBy: [{ registeredAt: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        user: { select: { username: true, displayName: true, avatarKey: true, institution: true } },
      },
    });
    return {
      items: rows.map((p) => ({
        userId: p.userId,
        username: p.user.username,
        displayName: p.user.displayName,
        avatarKey: p.user.avatarKey,
        institution: p.user.institution,
        status: p.status as EventParticipantDto['status'],
        registeredAt: p.registeredAt.toISOString(),
        joinedAt: p.joinedAt?.toISOString() ?? null,
        completedAt: p.completedAt?.toISOString() ?? null,
        score: p.score,
        rank: p.rank,
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async invite(
    id: string,
    input: EventInviteInput,
    caller: Caller,
  ): Promise<{ id: string; status: string }> {
    const event = await this.requireEvent(id);
    this.requireManager(event, caller);
    let targetUserId: string | null = input.invitedUserId ?? null;
    if (!targetUserId && input.invitedEmail) {
      const user = await this.prisma.user.findFirst({
        where: { email: { equals: input.invitedEmail, mode: 'insensitive' } },
        select: { id: true },
      });
      targetUserId = user?.id ?? null;
    }
    try {
      const invite = await this.prisma.eventInvite.create({
        data: {
          eventId: event.id,
          invitedUserId: targetUserId,
          invitedEmail: input.invitedEmail ?? null,
          invitedById: caller.id,
          status: 'PENDING',
        },
      });
      if (targetUserId) {
        void this.eventQueue
          .notifyUser({
            userId: targetUserId,
            type: 'EVENT_UPDATED',
            title: `Invited: ${event.title}`,
            body: 'You were invited to a private event.',
            eventId: event.id,
          })
          .catch(() => undefined);
      }
      return { id: invite.id, status: invite.status };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new EventStateError('That user is already invited.');
      }
      throw error;
    }
  }

  async invites(id: string, caller: Caller) {
    const event = await this.requireEvent(id);
    this.requireManager(event, caller);
    const rows = await this.prisma.eventInvite.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        eventId: r.eventId,
        invitedUserId: r.invitedUserId,
        invitedEmail: r.invitedEmail,
        status: r.status as 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED',
        createdAt: r.createdAt.toISOString(),
        respondedAt: r.respondedAt?.toISOString() ?? null,
      })),
    };
  }

  async respondInvite(id: string, accept: boolean, caller: Caller) {
    const event = await this.requireEvent(id);
    const invite = await this.prisma.eventInvite.findFirst({
      where: { eventId: event.id, invitedUserId: caller.id, status: 'PENDING' },
    });
    if (!invite) {
      throw new EventNotFoundError('No pending invite for this event.');
    }
    await this.prisma.eventInvite.update({
      where: { id: invite.id },
      data: { status: accept ? 'ACCEPTED' : 'DECLINED', respondedAt: new Date() },
    });
    if (accept) {
      return this.register(event.id, caller);
    }
    return { registered: false };
  }

  // ─── Admin moderation ───────────────────────────────────────────────────

  async adminList(query: EventListQuery & { status?: string }, caller: Caller) {
    this.requireAdmin(caller);
    const where: Prisma.EventWhereInput = {};
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { organizer: { displayName: { contains: query.q, mode: 'insensitive' } } },
      ];
    }
    const total = await this.prisma.event.count({ where });
    const rows = await this.prisma.event.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        organizer: { select: { displayName: true } },
        organization: { select: { id: true, name: true } },
        _count: { select: { participants: true } },
      },
    });
    return {
      items: (rows as EventRow[]).map((r) => this.toSummary(r, false)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async auditLog(id: string, caller: Caller) {
    const event = await this.requireEvent(id);
    this.requireManager(event, caller);
    const rows = await this.prisma.eventAudit.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { actor: { select: { displayName: true } } },
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        detail: r.detail,
        actor: r.actor?.displayName ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  // ─── Finalization / ranking ─────────────────────────────────────────────

  async finalizeParticipant(
    eventId: string,
    userId: string,
    auto: boolean,
  ): Promise<EventResultDto> {
    const locked = await this.lock.withLock(
      `event-finalize:${eventId}:${userId}`,
      FINALIZE_LOCK_TTL_MS,
      async () => this.runFinalize(eventId, userId, auto),
    );
    if (locked) {
      return locked;
    }
    // Another worker is finalizing — read the persisted result.
    const participant = await this.requireParticipant(eventId, userId);
    const existing = await this.prisma.eventResult.findUnique({
      where: { participantId: participant.id },
    });
    if (!existing) {
      throw new EventStateError('Finalization is in progress. Please retry.');
    }
    return this.toResult(eventId, participant, existing);
  }

  private async runFinalize(
    eventId: string,
    userId: string,
    auto: boolean,
  ): Promise<EventResultDto> {
    const participant = await this.requireParticipant(eventId, userId);
    const existing = await this.prisma.eventResult.findUnique({
      where: { participantId: participant.id },
    });
    if (existing) {
      return this.toResult(eventId, participant, existing);
    }
    const questions = await this.loadQuestions(eventId);
    const answers = await this.prisma.eventAnswer.findMany({
      where: { participantId: participant.id },
    });
    const byQuestion = new Map(answers.map((a) => [a.eventQuestionId, a]));
    let score = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let totalPoints = 0;
    const correctness = new Map<string, boolean | null>();
    for (const q of questions) {
      totalPoints += q.points;
      const answer = byQuestion.get(q.id);
      const correct = q.problem.options.find((o) => o.isCorrect);
      if (!answer?.selectedOptionId) {
        correctness.set(q.id, null);
        continue;
      }
      const isCorrect = answer.selectedOptionId === correct?.id;
      correctness.set(q.id, isCorrect);
      if (isCorrect) {
        score += q.points;
        correctCount += 1;
      } else {
        wrongCount += 1;
      }
    }
    const unansweredCount = Math.max(0, questions.length - correctCount - wrongCount);
    const joinedAt = participant.joinedAt ?? participant.registeredAt;
    const completionSeconds = Math.max(0, Math.round((Date.now() - joinedAt.getTime()) / 1000));
    const now = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.eventParticipant.update({
          where: { id: participant.id },
          data: {
            status: auto ? 'AUTO_SUBMITTED' : 'SUBMITTED',
            submittedAt: now,
            completedAt: now,
            score,
          },
        });
        for (const [questionId, value] of correctness) {
          await tx.eventAnswer.updateMany({
            where: { eventQuestionId: questionId, participantId: participant.id },
            data: { isCorrect: value },
          });
        }
        await tx.eventResult.create({
          data: {
            eventId,
            userId,
            participantId: participant.id,
            score,
            correctCount,
            wrongCount,
            unansweredCount,
            totalPoints,
            completionSeconds,
            autoSubmitted: auto,
            finalizedAt: now,
          },
        });
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const raced = await this.prisma.eventResult.findUnique({
          where: { participantId: participant.id },
        });
        if (raced) {
          const refreshed = await this.requireParticipant(eventId, userId);
          return this.toResult(eventId, refreshed, raced);
        }
      }
      throw error;
    }
    await this.assignRanks(eventId).catch((error) =>
      this.logger.warn(`event.rank-failed event=${eventId} ${String(error)}`, 'Events'),
    );
    const refreshed = await this.requireParticipant(eventId, userId);
    const result = await this.prisma.eventResult.findUnique({
      where: { participantId: participant.id },
    });
    // Activity reward for submitting. Best-effort: never rolls back the result.
    void this.points
      .awardTrigger({
        userId,
        trigger: 'event-participate',
        sourceType: 'event',
        sourceId: eventId,
      })
      .catch(() => undefined);
    // Fresh result only: replays return above without recording.
    void this.analytics.record('event.submitted', { userId, metadata: { eventId, auto } });
    return this.toResult(eventId, refreshed, result!);
  }

  private async assignRanks(eventId: string): Promise<void> {
    // Two set-based statements replace the per-participant update loop.
    // Ordering mirrors compareEventResults (score DESC, correctCount DESC,
    // completionSeconds ASC, userId ASC).
    const locked = await this.lock.withLock(
      `event-close:${eventId}`,
      CLOSE_LOCK_TTL_MS,
      async () => {
        await this.prisma.$queryRaw`
        WITH ranked AS (
          SELECT "id", "participantId", "score", ROW_NUMBER() OVER (
            ORDER BY "score" DESC, "correctCount" DESC, "completionSeconds" ASC, "userId" ASC
          ) AS rn
          FROM "event_results"
          WHERE "eventId" = ${eventId}::uuid
        )
        UPDATE "event_results" AS r SET "rank" = ranked.rn
        FROM ranked WHERE r."id" = ranked."id"`;
        await this.prisma.$queryRaw`
        UPDATE "event_participants" AS p
        SET "rank" = ranked.rn, "score" = ranked.score
        FROM (
          SELECT "participantId", "score", ROW_NUMBER() OVER (
            ORDER BY "score" DESC, "correctCount" DESC, "completionSeconds" ASC, "userId" ASC
          ) AS rn
          FROM "event_results"
          WHERE "eventId" = ${eventId}::uuid
        ) AS ranked
        WHERE p."id" = ranked."participantId"`;
      },
    );
    void locked;
  }

  // ─── Guards / helpers ───────────────────────────────────────────────────

  private async requireEvent(idOrSlug: string): Promise<EventRow> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
    const event = (await this.prisma.event.findFirst({
      where: isUuid ? { id: idOrSlug } : { slug: idOrSlug },
      include: {
        organizer: { select: { displayName: true } },
        organization: { select: { id: true, name: true } },
        _count: { select: { participants: true } },
      },
    })) as EventRow | null;
    if (!event) {
      throw new EventNotFoundError();
    }
    // Every read converges the lifecycle: without this, an event whose start
    // passed sits in "upcoming" until somebody presses a manage button, so
    // registered users can never enter and the live tab stays empty.
    return this.maybeAdvanceEvent(event);
  }

  /**
   * Discovery-time bulk flips (two cheap writes). Overdue closes run in the
   * background, bounded — detail reads converge them via maybeAdvanceEvent
   * regardless. Never throws: discovery must survive a sweep failure.
   */
  private async sweepEventStatuses(): Promise<void> {
    const now = new Date();
    const flips: Array<{
      where: Prisma.EventWhereInput;
      to: 'REGISTRATION_OPEN' | 'LIVE' | 'REGISTRATION_CLOSED';
    }> = [
      {
        where: {
          status: 'PUBLISHED',
          OR: [{ registrationStartAt: null }, { registrationStartAt: { lte: now } }],
          startAt: { gt: now },
        },
        to: 'REGISTRATION_OPEN',
      },
      {
        where: {
          status: { in: ['PUBLISHED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED'] },
          startAt: { lte: now },
          endAt: { gt: now },
        },
        to: 'LIVE',
      },
      {
        where: {
          status: 'REGISTRATION_OPEN',
          registrationEndAt: { lte: now },
          startAt: { gt: now },
        },
        to: 'REGISTRATION_CLOSED',
      },
    ];
    for (const flip of flips) {
      try {
        await this.prisma.event.updateMany({ where: flip.where, data: { status: flip.to } });
      } catch (error) {
        this.logger.warn(
          `event.sweep-flip-failed ${error instanceof Error ? error.message : String(error)}`,
          'Events',
        );
        return;
      }
    }
    let overdue: Array<{ id: string }> = [];
    try {
      overdue = await this.prisma.event.findMany({
        where: {
          status: { in: ['PUBLISHED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'LIVE'] },
          endAt: { lte: now },
        },
        select: { id: true },
        orderBy: { endAt: 'asc' },
        take: 10,
      });
    } catch (error) {
      this.logger.warn(
        `event.sweep-scan-failed ${error instanceof Error ? error.message : String(error)}`,
        'Events',
      );
      return;
    }
    if (overdue.length > 0) {
      void (async () => {
        for (const row of overdue) {
          try {
            await this.maybeAdvanceEvent(await this.requireEvent(row.id));
          } catch {
            // Gone or raced — the next sweep converges.
          }
        }
      })();
    }
  }

  /**
   * Due-status advancement for a single loaded row. Cheap timestamp checks
   * first — the write happens only when a transition is actually due.
   * COMPLETED also recomputes ranks (background: never blocks the read).
   */
  private async maybeAdvanceEvent(event: EventRow): Promise<EventRow> {
    const now = new Date();
    let next: EventRow['status'] | null = null;
    if (
      event.status !== 'DRAFT' &&
      event.status !== 'CANCELLED' &&
      event.status !== 'ARCHIVED' &&
      event.status !== 'COMPLETED' &&
      now >= event.endAt
    ) {
      next = 'COMPLETED';
    } else if (
      (event.status === 'PUBLISHED' ||
        event.status === 'REGISTRATION_OPEN' ||
        event.status === 'REGISTRATION_CLOSED') &&
      now >= event.startAt &&
      now < event.endAt
    ) {
      next = 'LIVE';
    } else if (
      event.status === 'PUBLISHED' &&
      (!event.registrationStartAt || now >= event.registrationStartAt) &&
      now < event.startAt
    ) {
      next = 'REGISTRATION_OPEN';
    } else if (
      event.status === 'REGISTRATION_OPEN' &&
      event.registrationEndAt &&
      now >= event.registrationEndAt &&
      now < event.startAt
    ) {
      next = 'REGISTRATION_CLOSED';
    }
    if (!next) {
      return event;
    }
    try {
      await this.prisma.event.update({ where: { id: event.id }, data: { status: next } });
      await this.prisma.eventAudit.create({
        data: { eventId: event.id, action: `event.auto:${next}` },
      });
    } catch (error) {
      this.logger.warn(
        `event.auto-advance-failed ${event.id} ${error instanceof Error ? error.message : String(error)}`,
        'Events',
      );
      return event;
    }
    if (next === 'COMPLETED') {
      void this.assignRanks(event.id).catch((error: unknown) =>
        this.logger.warn(
          `event.auto-ranks-failed ${event.id} ${error instanceof Error ? error.message : String(error)}`,
          'Events',
        ),
      );
    } else if (next === 'LIVE') {
      void this.eventQueue
        .notifyParticipants({
          eventId: event.id,
          type: 'EVENT_STARTED',
          title: `Event is live: ${event.title}`,
        })
        .catch(() => undefined);
    }
    await this.invalidateEventCache(event.id);
    return { ...event, status: next };
  }

  private async findParticipant(eventId: string, userId: string): Promise<ParticipantRow | null> {
    return (await this.prisma.eventParticipant.findUnique({
      where: { eventId_userId: { eventId, userId } },
    })) as ParticipantRow | null;
  }

  private async requireParticipant(eventId: string, userId: string): Promise<ParticipantRow> {
    if (!userId) {
      throw new AuthRequiredError('Sign in to enter this event.');
    }
    const participant = await this.findParticipant(eventId, userId);
    if (!participant) {
      throw new EventNotRegisteredError();
    }
    return participant;
  }

  private async requireAnswerable(eventId: string, userId: string, questionId: string) {
    const event = await this.requireEvent(eventId);
    this.assertParticipable(event);
    const participant = await this.requireParticipant(eventId, userId);
    if (participant.status === 'SUBMITTED' || participant.status === 'AUTO_SUBMITTED') {
      throw new EventStateError('This event was already submitted.');
    }
    if (!participant.joinedAt || !participant.effectiveEndAt) {
      throw new EventNotRegisteredError('Join the event to start your session.');
    }
    const now = new Date();
    if (now >= participant.effectiveEndAt || now >= event.endAt) {
      await this.finalizeParticipant(eventId, userId, true);
      throw new EventExpiredError();
    }
    const question = (await this.prisma.eventQuestion.findFirst({
      where: { id: questionId, eventId },
      include: {
        problem: {
          include: {
            assets: { orderBy: { position: 'asc' } },
            options: { orderBy: { position: 'asc' } },
          },
        },
      },
    })) as EventQuestionRow | null;
    if (!question) {
      throw new EventQuestionError();
    }
    return { event, participant, question };
  }

  private assertParticipable(event: EventRow): void {
    if (!isParticipableStatus(event.status)) {
      throw new EventNotFoundError('This event is not available.');
    }
  }

  private assertRegistrationOpen(event: EventRow): void {
    if (event.status !== 'REGISTRATION_OPEN') {
      throw new EventRegistrationError(`Registration is not open (status: ${event.status}).`);
    }
    const now = new Date();
    if (event.registrationStartAt && now < event.registrationStartAt) {
      throw new EventRegistrationError('Registration has not opened yet.');
    }
    if (event.registrationEndAt && now > event.registrationEndAt) {
      throw new EventRegistrationError('Registration has closed.');
    }
    if (now > event.endAt) {
      throw new EventRegistrationError('This event has ended.');
    }
  }

  /** Visibility + membership + invite enforcement for view/register/participate. */
  /**
   * Entry rule. PRIVATE events admit invitees always; when an entry code is
   * set, the code is an equal second key for register/participate. Viewing a
   * private event only needs a signed-in user (so the code box can render) —
   * questions, answers and results stay gated behind participation.
   */
  private async assertEventAccess(
    event: EventRow,
    caller: Caller | null | undefined,
    action: 'view' | 'register' | 'participate',
    code?: string | null,
  ): Promise<void> {
    if (this.isAdmin(caller) || (caller && event.organizerId === caller.id)) {
      return;
    }
    if (event.visibility === 'PUBLIC' || event.visibility === 'COMMUNITY') {
      if ((action === 'register' || action === 'participate') && !caller) {
        throw new AuthRequiredError('Sign in to join this event.');
      }
      return;
    }
    if (!caller) {
      throw new EventForbiddenError('Sign in to access this event.');
    }
    if (event.visibility === 'PRIVATE') {
      if (action === 'view') {
        return;
      }
      if (await this.eventBypass(event, caller)) {
        return;
      }
      if (event.entryCode && code?.trim() === event.entryCode) {
        return;
      }
      throw new EventForbiddenError(
        event.entryCode ? 'Enter the event code to join.' : 'This is an invite-only event.',
      );
    }
    if (event.visibility === 'UNIVERSITY') {
      if (!event.organizationId) {
        throw new EventForbiddenError('This event is restricted.');
      }
      // Viewing only needs a signed-in user (so the join-organization and
      // code boxes can render) — questions, answers and results stay gated
      // behind membership below. Descriptions already leak via discovery.
      if (action === 'view') {
        return;
      }
      if (await this.eventBypass(event, caller)) {
        return;
      }
      // An entry code doubles as a guest pass for outsiders.
      if (event.entryCode && code?.trim() === event.entryCode) {
        return;
      }
      throw new EventForbiddenError(
        'This event is restricted to organization members — join the organization or enter the event code.',
      );
    }
  }

  /**
   * Standing access: managers, participants, invitees (and org members for
   * university events) bypass code/invite checks everywhere.
   */
  private async eventBypass(event: EventRow, caller: Caller | null | undefined): Promise<boolean> {
    if (!caller) {
      return false;
    }
    if (this.isAdmin(caller) || event.organizerId === caller.id) {
      return true;
    }
    const [participant, invite] = await Promise.all([
      this.findParticipant(event.id, caller.id),
      this.prisma.eventInvite.findFirst({
        where: {
          eventId: event.id,
          invitedUserId: caller.id,
          status: { in: ['PENDING', 'ACCEPTED'] },
        },
      }),
    ]);
    if (participant || invite) {
      return true;
    }
    if (event.visibility === 'UNIVERSITY' && event.organizationId) {
      const membership = await this.prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: { organizationId: event.organizationId, userId: caller.id },
        },
      });
      return Boolean(membership);
    }
    return false;
  }

  private async assertVisible(event: EventRow, caller?: Caller): Promise<void> {
    if (event.status === 'DRAFT' || event.status === 'ARCHIVED') {
      if (!this.canManage(event, caller)) {
        throw new EventNotFoundError();
      }
      return;
    }
    if (event.status === 'CANCELLED' && !this.canManage(event, caller)) {
      // Cancelled events stay discoverable in past lists but gated for private.
      if (event.visibility === 'PUBLIC' || event.visibility === 'COMMUNITY') {
        return;
      }
    }
    await this.assertEventAccess(event, caller ?? null, 'view');
  }

  private async registrationRestriction(
    event: EventRow,
    caller: Caller | undefined,
    participantStatus: string | null,
  ): Promise<string | null> {
    if (participantStatus) {
      return null;
    }
    if (event.status === 'CANCELLED') {
      return 'This event was cancelled.';
    }
    if (event.status === 'COMPLETED' || event.status === 'ARCHIVED') {
      return 'This event has ended.';
    }
    if (event.status === 'LIVE') {
      return 'This event is live; registration closed.';
    }
    if (event.status !== 'REGISTRATION_OPEN') {
      return 'Registration is not open yet.';
    }
    const now = new Date();
    if (event.registrationStartAt && now < event.registrationStartAt) {
      return 'Registration has not opened yet.';
    }
    if (event.registrationEndAt && now > event.registrationEndAt) {
      return 'Registration has closed.';
    }
    if (event.maxParticipants !== null && event.participantCount >= event.maxParticipants) {
      return 'This event is full.';
    }
    if (!caller) {
      return 'Sign in to register.';
    }
    try {
      await this.assertEventAccess(event, caller, 'register');
    } catch (error) {
      return error instanceof Error ? error.message : 'You cannot register for this event.';
    }
    return null;
  }

  private canManage(event: EventRow, caller?: Caller | null): boolean {
    if (!caller) {
      return false;
    }
    if (this.isAdmin(caller)) {
      return true;
    }
    if (event.organizerId === caller.id) {
      return true;
    }
    return caller.permissions.includes('manage:events');
  }

  private requireManager(event: EventRow, caller: Caller): void {
    if (!this.canManage(event, caller)) {
      throw new EventForbiddenError('Only the event creator or an admin can manage this event.');
    }
  }

  private requireAdmin(caller: Caller): void {
    if (!this.isAdmin(caller)) {
      throw new EventForbiddenError('Admin access is required.');
    }
  }

  private isAdmin(caller?: Caller | null): boolean {
    if (!caller) {
      return false;
    }
    return caller.roles.includes('admin') || caller.permissions.includes('manage:platform');
  }

  private async ensureOrgMembership(organizationId: string, caller: Caller): Promise<void> {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) {
      throw new EventValidationError('Organization not found.');
    }
    await this.prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId, userId: caller.id } },
      update: {},
      create: { organizationId, userId: caller.id },
    });
  }

  private async assertProblemsUsable(problemIds: string[]): Promise<void> {
    const rows = await this.prisma.problem.findMany({
      where: { id: { in: problemIds } },
      select: { id: true, status: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r.status]));
    for (const id of problemIds) {
      const status = byId.get(id);
      if (!status) {
        throw new EventQuestionError('One of the selected questions does not exist.');
      }
      if (status !== 'PUBLISHED') {
        throw new EventQuestionError('Only approved, published questions may be used in events.');
      }
    }
  }

  private async uniqueSlug(preferred: string): Promise<string> {
    const slug = preferred.slice(0, 120);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = attempt === 0 ? slug : `${slug}-${attempt + 1}`;
      const existing = await this.prisma.event.findUnique({ where: { slug: candidate } });
      if (!existing) {
        return candidate;
      }
    }
    return `${slug}-${Date.now().toString(36)}`;
  }

  private async loadQuestions(eventId: string): Promise<EventQuestionRow[]> {
    return (await this.prisma.eventQuestion.findMany({
      where: { eventId },
      orderBy: { order: 'asc' },
      include: {
        problem: {
          include: {
            assets: { orderBy: { position: 'asc' } },
            options: { orderBy: { position: 'asc' } },
          },
        },
      },
    })) as EventQuestionRow[];
  }

  private async resolveOptionUrls(questions: EventQuestionRow[]): Promise<Map<string, string>> {
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
    if (keys.length === 0) {
      return new Map();
    }
    return this.storage.getDownloadUrls(keys);
  }

  private async toQuestionView(
    question: EventQuestionRow,
    answer: { selectedOptionId: string | null; markedForReview: boolean } | null,
    opts: { answerable: boolean; reveal: boolean },
    urls: Map<string, string>,
  ) {
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
    const view: EventSessionDto['current'] = {
      position: question.order,
      questionId: question.id,
      problemId: question.problem.id,
      title: question.problem.title,
      statement: question.problem.statement,
      contentMode: question.problem.contentMode,
      difficulty: question.problem.difficulty,
      assets,
      options,
      points: question.points,
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
    const answers = await this.prisma.eventAnswer.findMany({
      where: { participantId },
      select: { selectedOptionId: true, markedForReview: true },
    });
    return {
      saved: true,
      answeredCount: answers.filter((a) => a.selectedOptionId).length,
      reviewCount: answers.filter((a) => a.markedForReview).length,
    };
  }

  private async registeredSet(eventIds: string[], userId?: string): Promise<Set<string>> {
    if (!userId || eventIds.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.eventParticipant.findMany({
      where: { eventId: { in: eventIds }, userId },
      select: { eventId: true },
    });
    return new Set(rows.map((row) => row.eventId));
  }

  private toSummary(event: EventRow, isRegistered: boolean): EventSummaryDto {
    const now = new Date();
    const live = event.status === 'LIVE' && now >= event.startAt && now <= event.endAt;
    const past = event.status === 'COMPLETED' || event.status === 'ARCHIVED' || now > event.endAt;
    const phase = live ? 'live' : past ? 'past' : 'upcoming';
    const registrationOpen =
      event.status === 'REGISTRATION_OPEN' &&
      (!event.registrationStartAt || now >= event.registrationStartAt) &&
      (!event.registrationEndAt || now <= event.registrationEndAt) &&
      now <= event.endAt;
    return {
      id: event.id,
      title: event.title,
      slug: event.slug,
      description: event.description?.slice(0, 280) ?? null,
      eventType: event.eventType,
      visibility: event.visibility,
      status: event.status,
      phase,
      difficulty: event.difficulty,
      durationMinutes: event.durationMinutes,
      questionCount: event.questionCount,
      participantCount: event._count?.participants ?? event.participantCount,
      maxParticipants: event.maxParticipants,
      spotsLeft:
        event.maxParticipants !== null
          ? Math.max(
              0,
              event.maxParticipants - (event._count?.participants ?? event.participantCount),
            )
          : null,
      registrationOpen,
      isRegistered,
      isOfficial: event.isOfficial,
      isPaid: event.isPaid,
      price: event.price,
      startsAt: event.startAt.toISOString(),
      endsAt: event.endAt.toISOString(),
      registrationStartAt: event.registrationStartAt?.toISOString() ?? null,
      registrationEndAt: event.registrationEndAt?.toISOString() ?? null,
      organizer: { id: event.organizerId, displayName: event.organizer?.displayName ?? 'ApteeZ' },
      organization: event.organization
        ? { id: event.organization.id, name: event.organization.name }
        : null,
    };
  }

  private async toResult(
    eventId: string,
    participant: ParticipantRow,
    result: {
      score: number;
      correctCount: number;
      wrongCount: number;
      unansweredCount: number;
      completionSeconds: number;
      rank: number | null;
      finalizedAt: Date;
      autoSubmitted: boolean;
    },
  ): Promise<EventResultDto> {
    const totalParticipants = await this.prisma.eventResult.count({ where: { eventId } });
    return {
      eventId,
      userId: participant.userId,
      score: result.score,
      correctCount: result.correctCount,
      wrongCount: result.wrongCount,
      unansweredCount: result.unansweredCount,
      completionSeconds: result.completionSeconds,
      rank: result.rank,
      totalParticipants,
      finalizedAt: result.finalizedAt.toISOString(),
      submittedAt: participant.submittedAt?.toISOString() ?? null,
      autoSubmitted: result.autoSubmitted,
    };
  }

  private listCacheKey(query: EventListQuery, caller?: Caller): string | null {
    if (caller) {
      return null;
    }
    const raw = `events:${JSON.stringify(query)}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i += 1) {
      hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
    }
    return redisKeys.eventListCache(hash.toString(36));
  }

  private async cacheGet<T>(key: string): Promise<T | null> {
    try {
      if (!this.redis.isReady()) {
        return null;
      }
      const raw = await this.redis.getClient().get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private async cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      if (!this.redis.isReady()) {
        return;
      }
      await this.redis.getClient().set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(`event.cache-set-failed ${String(error)}`, 'Events');
    }
  }

  private async invalidateEventCache(eventId: string): Promise<void> {
    try {
      if (!this.redis.isReady()) {
        return;
      }
      const client = this.redis.getClient();
      await client.del(redisKeys.eventDetailCache(eventId));
      await client.del(redisKeys.eventLive(eventId));
      // Discovery pages: scan-delete the small event:list:* family (never KEYS).
      const stream = client.scanStream({ match: redisKeys.eventListCache('*'), count: 100 });
      const keys: string[] = await new Promise((resolve, reject) => {
        const found: string[] = [];
        stream.on('data', (batch: string[]) => found.push(...batch));
        stream.on('end', () => resolve(found));
        stream.on('error', reject);
      });
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } catch (error) {
      this.logger.warn(`event.cache-invalidate-failed ${String(error)}`, 'Events');
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
    );
  }
}
