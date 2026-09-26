import type { PrismaService } from '@apteez/database';
import { InvalidSearchCursorError } from './search.errors';
import { SearchService } from './search.service';
import { encodeSearchCursor, fingerprintInput, fingerprintQuery } from './search-ranking.util';

function summary(id: string, title = `Problem ${id}`) {
  return {
    id,
    title,
    contentMode: 'TEXT_ONLY',
    difficulty: 'MEDIUM',
    rating: 1500,
    category: { slug: 'quant', name: 'Quant' },
    topic: { slug: 'algebra', name: 'Algebra' },
    subtopic: null,
    examTags: [],
    optionCount: 4,
    hasImage: false,
    hasExplanation: true,
    hasShortcut: false,
    publishedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    accuracy: 70,
    solvedCount: 10,
  };
}

function createService() {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    topic: { findMany: jest.fn().mockResolvedValue([]) },
    learningPath: { findMany: jest.fn().mockResolvedValue([]) },
    learningTopic: { findMany: jest.fn().mockResolvedValue([]) },
    learningLesson: { findMany: jest.fn().mockResolvedValue([]) },
    contest: { findMany: jest.fn().mockResolvedValue([]) },
    contestParticipant: { findMany: jest.fn().mockResolvedValue([]) },
    organizationMember: { findMany: jest.fn().mockResolvedValue([]) },
    eventInvite: { findMany: jest.fn().mockResolvedValue([]) },
    event: { findMany: jest.fn().mockResolvedValue([]) },
    eventParticipant: { findMany: jest.fn().mockResolvedValue([]) },
    discussionPost: { findMany: jest.fn().mockResolvedValue([]) },
    problem: { findMany: jest.fn().mockResolvedValue([]) },
    examTag: { findMany: jest.fn().mockResolvedValue([]) },
    searchEvent: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as PrismaService;
  const problems = {
    summarizeProblems: jest.fn(async (_userId: string | undefined, ids: string[]) => {
      const map = new Map();
      for (const id of ids) {
        map.set(id, summary(id));
      }
      return map;
    }),
  };
  const redis = { isReady: () => false, get: jest.fn(), set: jest.fn() };
  const logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
  const service = new SearchService(prisma, problems as never, redis as never, logger as never);
  return { service, prisma, problems };
}

const baseQuery = {
  q: 'algebra',
  type: 'PROBLEM' as const,
  sort: 'relevance' as const,
  limit: 2,
};

describe('SearchService problems', () => {
  it('paginates ranked results with query-bound cursors', async () => {
    const { service, prisma } = createService();
    (prisma.$queryRaw as jest.Mock)
      .mockResolvedValueOnce([
        { id: 'p1', rank: 400 },
        { id: 'p2', rank: 300 },
        { id: 'p3', rank: 10 },
      ])
      .mockResolvedValueOnce([{ id: 'p3', rank: 10 }]);
    const first = await service.searchProblems(
      { ...baseQuery },
      'u1',
      0,
      fingerprintInput('algebra', {
        type: 'PROBLEM',
        sort: 'relevance',
        limit: 2,
      }),
    );
    expect(first.items.map((item) => item.id)).toEqual(['p1', 'p2']);
    expect(first.hasNextPage).toBe(true);
    expect(first.nextCursor).not.toBeNull();

    // The cursor replays page two against the same query fingerprint.
    const decoded = JSON.parse(Buffer.from(first.nextCursor!, 'base64url').toString('utf8'));
    expect(decoded.o).toBe(2);
    const second = await service.search({ ...baseQuery, cursor: first.nextCursor! }, 'u1');
    expect((second as { items: Array<{ id: string }> }).items.map((item) => item.id)).toEqual([
      'p3',
    ]);
    expect((second as { hasNextPage: boolean }).hasNextPage).toBe(false);
  });

  it('rejects cursors minted for a different query', async () => {
    const { service } = createService();
    const foreign = encodeSearchCursor({ h: fingerprintQuery('other-print'), o: 0 });
    await expect(service.search({ ...baseQuery, cursor: foreign }, 'u1')).rejects.toBeInstanceOf(
      InvalidSearchCursorError,
    );
    await expect(
      service.search({ ...baseQuery, cursor: 'garbage!!' }, 'u1'),
    ).rejects.toBeInstanceOf(InvalidSearchCursorError);
  });

  it('always scopes problem search to published rows', async () => {
    const { service, prisma } = createService();
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
    await service.searchProblems({ ...baseQuery }, undefined, 0, 'print');
    // $queryRaw is invoked as a template tag, so the mock records the
    // strings array plus one arg per interpolated value.
    const call = (prisma.$queryRaw as jest.Mock).mock.calls[0] as unknown[];
    const strings = call[0] as string[];
    const values = call.slice(1);
    expect(strings.join(' ')).toContain('PUBLISHED');
    expect(values).toContain('algebra');
  });
});

describe('SearchService visibility', () => {
  it('hides private events from anonymous callers', async () => {
    const { service, prisma } = createService();
    await service.searchEvents('workshop', undefined, 5, 0, null);
    const where = (prisma.event.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.AND[0]).toEqual({ visibility: 'PUBLIC' });
    expect(JSON.stringify(where)).not.toContain('PRIVATE');
  });

  it('widens visibility for members to org events and invites only', async () => {
    const { service, prisma } = createService();
    (prisma.organizationMember.findMany as jest.Mock).mockResolvedValue([
      { organizationId: 'org1' },
    ]);
    (prisma.eventInvite.findMany as jest.Mock).mockResolvedValue([{ eventId: 'ev9' }]);
    await service.searchEvents('workshop', 'u1', 5, 0, null);
    const where = (prisma.event.findMany as jest.Mock).mock.calls[0][0].where;
    const visibility = where.AND[0].OR;
    expect(visibility).toContainEqual({ organizationId: { in: ['org1'] } });
    expect(visibility).toContainEqual({ id: { in: ['ev9'] } });
    expect(JSON.stringify(where)).not.toContain('PRIVATE');
  });

  it('never returns drafts, cancelled or deleted rows', async () => {
    const { service, prisma } = createService();
    await service.searchContests('math', undefined, 5, 0, null);
    await service.searchDiscussions('math', 5, 0, null);
    const contestWhere = (prisma.contest.findMany as jest.Mock).mock.calls[0][0].where;
    expect(contestWhere.status).toEqual({
      in: ['PUBLISHED', 'REGISTRATION_OPEN', 'LIVE', 'ENDED'],
    });
    const discussionWhere = (prisma.discussionPost.findMany as jest.Mock).mock.calls[0][0].where;
    expect(discussionWhere.deletedAt).toBeNull();
  });
});

describe('SearchService analytics', () => {
  it('logs events without blocking when the write fails', async () => {
    const { service, prisma } = createService();
    (prisma.searchEvent.create as jest.Mock).mockRejectedValue(new Error('db down'));
    expect(() => service.logEvent({ event: 'search', query: 'algebra' }, 'u1')).not.toThrow();
    // Flush the fire-and-forget microtask so the rejection handler runs.
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('dedupes recent searches to the latest occurrence, capped at ten', async () => {
    const { service, prisma } = createService();
    const rows = Array.from({ length: 12 }, (_, index) => ({
      query: index % 2 === 0 ? 'Algebra' : `topic-${index}`,
      resultType: 'PROBLEM',
      createdAt: new Date(Date.now() - index * 1000),
    }));
    (prisma.searchEvent.findMany as jest.Mock).mockResolvedValue(rows);
    const recent = await service.recentSearches('u1');
    expect(recent).toHaveLength(7);
    expect(recent[0].query).toBe('Algebra');
  });

  it('returns grouped discovery shelves for type=all', async () => {
    const { service, prisma } = createService();
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
    const grouped = (await service.search(
      { q: 'x', type: 'all', sort: 'relevance', limit: 20 },
      undefined,
    )) as Record<string, unknown[]>;
    for (const key of ['problems', 'topics', 'learning', 'contests', 'events', 'discussions']) {
      expect(grouped[key]).toBeDefined();
    }
  });
});
