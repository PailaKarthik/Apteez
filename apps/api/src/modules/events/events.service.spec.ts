import type { PrismaService } from '@apteez/database';
import { EventsService } from './events.service';
import { EventForbiddenError, EventRegistrationError, EventStateError } from './events.errors';

function baseEvent(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  const day = 86_400_000;
  return {
    id: 'e1',
    organizerId: 'org1',
    organizationId: null,
    title: 'Test Event',
    slug: 'test-event',
    description: 'A sufficiently long description for tests.',
    bannerKey: null,
    eventType: 'CONTEST',
    visibility: 'PUBLIC',
    status: 'REGISTRATION_OPEN',
    difficulty: 'MEDIUM',
    maxParticipants: null,
    registrationStartAt: new Date(now.getTime() - day),
    registrationEndAt: new Date(now.getTime() + 29 * day),
    startAt: new Date(now.getTime() + 30 * day),
    endAt: new Date(now.getTime() + 31 * day),
    durationMinutes: 60,
    isPaid: false,
    price: null,
    rules: 'Rules text.',
    questionCount: 2,
    participantCount: 0,
    publishedAt: now,
    cancelledAt: null,
    organizer: { displayName: 'Org' },
    organization: null,
    _count: { participants: 0 },
    ...overrides,
  };
}

const ORGANIZER = { id: 'org1', roles: ['admin'], permissions: ['manage:events'] };
const MEMBER = { id: 'user1', roles: ['user'], permissions: [] as string[] };
const ADMIN = { id: 'admin1', roles: ['admin'], permissions: ['manage:platform'] };

function createPrisma(eventRow: Record<string, unknown>) {
  const txQueryRaw = jest.fn().mockResolvedValue([]);
  const txMocks = {
    eventParticipant: {
      create: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    event: { create: jest.fn(), update: jest.fn() },
    eventQuestion: { createMany: jest.fn(), deleteMany: jest.fn() },
    eventAudit: { create: jest.fn() },
    eventAnswer: { updateMany: jest.fn() },
    eventResult: { create: jest.fn() },
    eventParticipantUpdate: jest.fn(),
    $queryRaw: txQueryRaw,
  };
  const mock = {
    event: {
      findFirst: jest.fn().mockResolvedValue(eventRow),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue(eventRow),
    },
    eventParticipant: {
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
    },
    eventInvite: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    organizationMember: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    organization: { findUnique: jest.fn().mockResolvedValue(null) },
    eventQuestion: { findMany: jest.fn().mockResolvedValue([]) },
    eventAnswer: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
    eventResult: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
    },
    eventAudit: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    problem: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findFirst: jest.fn().mockResolvedValue(null) },
    notification: {
      create: jest.fn(),
      createMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(txMocks)),
    _tx: txMocks,
  };
  return mock;
}

function createService(eventRow: Record<string, unknown>) {
  const prisma = createPrisma(eventRow) as unknown as PrismaService;
  const lock = {
    withLock: jest.fn(async (_name: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
  };
  const redis = {
    isReady: () => false,
    getClient: () => ({ get: jest.fn(), set: jest.fn(), del: jest.fn(), scanStream: jest.fn() }),
  };
  const storage = {
    getDownloadUrl: jest.fn().mockResolvedValue(null),
    getDownloadUrls: jest.fn().mockResolvedValue(new Map()),
  };
  const eventQueue = {
    notifyUser: jest.fn().mockResolvedValue(undefined),
    notifyParticipants: jest.fn().mockResolvedValue(undefined),
  };
  const points = {
    awardRule: jest.fn().mockResolvedValue({ awarded: true, capped: false, balance: 10 }),
  };
  const analytics = { record: jest.fn().mockResolvedValue(undefined) };
  const logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
  const service = new EventsService(
    prisma,
    lock as never,
    redis as never,
    storage as never,
    eventQueue as never,
    points as never,
    analytics as never,
    logger as never,
  );
  return { service, prisma, lock };
}

describe('EventsService registration', () => {
  it('rejects registration for cancelled events', async () => {
    const { service } = createService(baseEvent({ status: 'CANCELLED' }));
    await expect(service.register('e1', MEMBER)).rejects.toBeInstanceOf(EventRegistrationError);
  });

  it('rejects registration for completed events', async () => {
    const { service } = createService(baseEvent({ status: 'COMPLETED' }));
    await expect(service.register('e1', MEMBER)).rejects.toBeInstanceOf(EventRegistrationError);
  });

  it('rejects registration when closed', async () => {
    const { service } = createService(baseEvent({ status: 'REGISTRATION_CLOSED' }));
    await expect(service.register('e1', MEMBER)).rejects.toBeInstanceOf(EventRegistrationError);
  });

  it('enforces capacity atomically', async () => {
    const { service, prisma } = createService(baseEvent({ maxParticipants: 1 }));
    (
      (prisma as unknown as { _tx: { eventParticipant: { count: jest.Mock } } })._tx
        .eventParticipant.count as jest.Mock
    ).mockResolvedValue(1);
    await expect(service.register('e1', MEMBER)).rejects.toThrow('full');
  });

  it('treats duplicate registration as idempotent', async () => {
    const { service, prisma } = createService(baseEvent({}));
    (prisma.eventParticipant.findUnique as jest.Mock).mockResolvedValue({
      id: 'p1',
      eventId: 'e1',
      userId: 'user1',
      status: 'REGISTERED',
    });
    await expect(service.register('e1', MEMBER)).resolves.toEqual({
      registered: true,
      status: 'REGISTERED',
    });
  });

  it('handles unique-constraint races as already-registered', async () => {
    const { service, prisma } = createService(baseEvent({}));
    const err = Object.assign(new Error('unique'), { code: 'P2002' });
    (prisma.$transaction as jest.Mock).mockRejectedValue(err);
    await expect(service.register('e1', MEMBER)).resolves.toEqual({
      registered: true,
      status: 'REGISTERED',
    });
  });

  it('blocks private events without an invite', async () => {
    const { service } = createService(baseEvent({ visibility: 'PRIVATE' }));
    await expect(service.register('e1', MEMBER)).rejects.toBeInstanceOf(EventForbiddenError);
  });

  it('admits private events with the entry code, rejects without it', async () => {
    const row = baseEvent({ visibility: 'PRIVATE', entryCode: 'friends-1' });
    const { service } = createService(row);
    await expect(service.register('e1', MEMBER)).rejects.toThrow('Enter the event code');
    await expect(service.register('e1', MEMBER, 'wrong')).rejects.toThrow('Enter the event code');
    await expect(service.register('e1', MEMBER, 'friends-1')).resolves.toEqual({
      registered: true,
      status: 'REGISTERED',
    });
  });

  it('blocks university events for non-members', async () => {
    const { service } = createService(
      baseEvent({ visibility: 'UNIVERSITY', organizationId: 'o1' }),
    );
    await expect(service.register('e1', MEMBER)).rejects.toBeInstanceOf(EventForbiddenError);
  });

  it('auto-joins the creator to the organization on university event create', async () => {
    const { service, prisma } = createService(baseEvent({}));
    (prisma.organization.findUnique as jest.Mock).mockResolvedValue({ id: 'o1' });
    const tx = (
      prisma as unknown as {
        _tx: { event: { create: jest.Mock } };
      }
    )._tx;
    tx.event.create.mockResolvedValue({ id: 'e-new' });
    await service.create(
      {
        title: 'University championship event',
        description: 'A sufficiently long description for creation.',
        eventType: 'CONTEST',
        visibility: 'UNIVERSITY',
        organizationId: 'o1',
        difficulty: 'MEDIUM',
        durationMinutes: 60,
        startAt: new Date('2026-08-01T10:00:00.000Z'),
        endAt: new Date('2026-08-01T12:00:00.000Z'),
        isPaid: false,
        problemIds: [],
      } as never,
      MEMBER,
    );
    expect(prisma.organizationMember.upsert as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_userId: { organizationId: 'o1', userId: 'user1' } },
      }),
    );
  });

  it('lets signed-in non-members view university events (to join the org)', async () => {
    const { service } = createService(
      baseEvent({ visibility: 'UNIVERSITY', organizationId: 'o1' }),
    );
    const detail = await service.detail('e1', MEMBER);
    expect(detail.organizationIsMember).toBe(false);
    expect(detail.requiresCode).toBe(false);
  });

  it('auto-flips registration-open events live once started', async () => {
    const now = new Date();
    const { service, prisma } = createService(
      baseEvent({
        status: 'REGISTRATION_OPEN',
        startAt: new Date(now.getTime() - 60_000),
        endAt: new Date(now.getTime() + 3_600_000),
      }),
    );
    const detail = await service.detail('e1', MEMBER);
    expect(detail.status).toBe('LIVE');
    expect(prisma.event.update as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'LIVE' }) }),
    );
  });

  it('auto-completes overdue live events on read', async () => {
    const now = new Date();
    const { service, prisma } = createService(
      baseEvent({
        status: 'LIVE',
        startAt: new Date(now.getTime() - 7_200_000),
        endAt: new Date(now.getTime() - 3_600_000),
      }),
    );
    const detail = await service.detail('e1', MEMBER);
    expect(detail.status).toBe('COMPLETED');
    expect(prisma.event.update as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
    );
  });
});

describe('EventsService authorization', () => {
  it('marks member-created events community and admin-created events official', async () => {
    const { service, prisma } = createService(baseEvent({}));
    const tx = (
      prisma as unknown as {
        _tx: { event: { create: jest.Mock } };
      }
    )._tx;
    const input = {
      title: 'Valid title here',
      description: 'A sufficiently long description for creation.',
      eventType: 'CONTEST',
      visibility: 'PUBLIC',
      difficulty: 'MEDIUM',
      durationMinutes: 60,
      startAt: new Date('2026-08-01T10:00:00.000Z'),
      endAt: new Date('2026-08-01T12:00:00.000Z'),
      isPaid: false,
      problemIds: [],
    } as never;
    tx.event.create.mockResolvedValue({ id: 'e-new' });
    await service.create(input, MEMBER);
    expect(tx.event.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isOfficial: false }) }),
    );
    tx.event.create.mockClear();
    tx.event.create.mockResolvedValue({ id: 'e-new-2' });
    await service.create(input, ADMIN);
    expect(tx.event.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isOfficial: true }) }),
    );
  });

  it('filters official vs community origins', async () => {
    const { service, prisma } = createService(baseEvent({}));
    await service.list({ phase: 'active', origin: 'official', page: 1, pageSize: 20 }, MEMBER);
    expect(prisma.event.findMany as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isOfficial: true }),
      }),
    );
    await service.list({ phase: 'active', origin: 'community', page: 1, pageSize: 20 }, MEMBER);
    expect(prisma.event.findMany as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isOfficial: false }),
      }),
    );
  });

  it('lets creators manage their own events but blocks strangers', async () => {
    const { service } = createService(baseEvent({ organizerId: 'org1' }));
    const stranger = { id: 'stranger', roles: ['user'], permissions: [] as string[] };
    await expect(
      service.update('e1', { title: 'New title here' }, stranger),
    ).rejects.toBeInstanceOf(EventForbiddenError);
    await expect(service.auditLog('e1', stranger)).rejects.toBeInstanceOf(EventForbiddenError);
    // Admin bypasses ownership.
    await expect(service.auditLog('e1', ADMIN)).resolves.toBeDefined();
  });

  it('forbids withdrawal after entering (ACTIVE)', async () => {
    const { service, prisma } = createService(baseEvent({}));
    (prisma.eventParticipant.findUnique as jest.Mock).mockResolvedValue({
      id: 'p1',
      eventId: 'e1',
      userId: 'user1',
      status: 'ACTIVE',
    });
    await expect(service.withdraw('e1', MEMBER)).rejects.toBeInstanceOf(EventStateError);
  });

  it('rejects paid-event creation until payments exist', async () => {
    const { service } = createService(baseEvent({}));
    await expect(
      service.create(
        {
          title: 'Paid event title',
          description: 'A sufficiently long description for paid events.',
          eventType: 'CONTEST',
          visibility: 'PUBLIC',
          difficulty: 'MEDIUM',
          durationMinutes: 60,
          startAt: new Date('2026-08-01T10:00:00.000Z'),
          endAt: new Date('2026-08-01T12:00:00.000Z'),
          isPaid: true,
          price: 99,
          problemIds: [],
        } as never,
        ORGANIZER,
      ),
    ).rejects.toThrow('not enabled');
  });
});
