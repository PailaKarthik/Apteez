import { FeedbackNotFoundError, FeedbackService } from './feedback.service';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f1',
    category: 'bug',
    description: 'The timer froze at zero on the challenge page.',
    page: '/challenge/abc',
    status: 'OPEN',
    priority: 'MEDIUM',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    resolvedAt: null,
    user: { id: 'u1', username: 'user1', displayName: 'User One' },
    ...overrides,
  };
}

function createService() {
  const prisma = {
    feedback: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = new FeedbackService(prisma as never);
  return { service, prisma };
}

describe('FeedbackService', () => {
  it('files feedback with medium priority and open status', async () => {
    const { service, prisma } = createService();
    (prisma.feedback.create as jest.Mock).mockResolvedValue({ id: 'f1' });
    const result = await service.submit('u1', {
      category: 'bug',
      description: 'The timer froze at zero on the challenge page.',
      page: '/challenge/abc',
    });
    expect(result).toEqual({ id: 'f1' });
    expect(prisma.feedback.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'u1', status: 'OPEN', priority: 'MEDIUM' }),
      }),
    );
  });

  it('supports anonymous filing with a null user', async () => {
    const { service, prisma } = createService();
    (prisma.feedback.create as jest.Mock).mockResolvedValue({ id: 'f2' });
    await service.submit(undefined, {
      category: 'ui-issue',
      description: 'The leaderboard overlaps the footer on small screens here.',
    });
    expect(prisma.feedback.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: null }) }),
    );
  });

  it('trims reporter identity and stamps resolution on resolve', async () => {
    const { service, prisma } = createService();
    (prisma.feedback.findUnique as jest.Mock).mockResolvedValue({
      id: 'f1',
      status: 'OPEN',
      priority: 'MEDIUM',
    });
    (prisma.feedback.update as jest.Mock).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => row({ ...data }),
    );
    const { dto, changed } = await service.update('f1', { status: 'RESOLVED' });
    expect(changed).toBe(true);
    expect(dto.status).toBe('RESOLVED');
    expect(dto.resolvedAt).not.toBeNull();
    expect(dto.reporter).toEqual({ id: 'u1', username: 'user1', displayName: 'User One' });
    expect(JSON.stringify(dto)).not.toContain('passwordHash');
  });

  it('is a no-op when nothing changes', async () => {
    const { service, prisma } = createService();
    (prisma.feedback.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'f1', status: 'OPEN', priority: 'MEDIUM' })
      .mockResolvedValueOnce(row());
    const { dto, changed } = await service.update('f1', { status: 'OPEN' });
    expect(changed).toBe(false);
    expect(dto.id).toBe('f1');
    expect(prisma.feedback.update).not.toHaveBeenCalled();
  });

  it('throws for unknown feedback', async () => {
    const { service, prisma } = createService();
    (prisma.feedback.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.update('missing', { status: 'RESOLVED' })).rejects.toBeInstanceOf(
      FeedbackNotFoundError,
    );
  });
});
