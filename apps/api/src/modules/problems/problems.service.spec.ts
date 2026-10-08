import type { PrismaService } from '@apteez/database';
import { AuthRequiredError } from '../auth/auth.errors';
import { ProblemsService } from './problems.service';

function setup(countImpl: jest.Mock) {
  const prisma = { problem: { count: countImpl } };
  const service = new ProblemsService(prisma as unknown as PrismaService, null as never);
  return { service, prisma };
}

const BASE_QUERY = {
  sort: 'newest' as const,
  limit: 20 as const,
};

describe('ProblemsService.nextProblem', () => {
  function setupNext(findFirstImpl: jest.Mock) {
    const prisma = { problem: { count: jest.fn(), findFirst: findFirstImpl } };
    const service = new ProblemsService(prisma as unknown as PrismaService, null as never);
    return service;
  }

  it('returns the next-newer problem in the same topic', async () => {
    const findFirst = jest.fn();
    findFirst.mockResolvedValueOnce({ topicId: 't1', createdAt: new Date('2026-01-01T00:00:00Z') });
    findFirst.mockResolvedValueOnce({ id: 'next-id' });
    const service = setupNext(findFirst);
    await expect(service.nextProblem('current-id')).resolves.toEqual({ id: 'next-id' });
    // Second call targets newer rows in ascending creation order.
    expect(findFirst.mock.calls[1]?.[0]).toMatchObject({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('wraps to the oldest in the topic at the end instead of going backwards', async () => {
    const findFirst = jest.fn();
    findFirst.mockResolvedValueOnce({ topicId: 't1', createdAt: new Date('2026-06-01T00:00:00Z') });
    findFirst.mockResolvedValueOnce(null);
    findFirst.mockResolvedValueOnce({ id: 'oldest-id' });
    const service = setupNext(findFirst);
    await expect(service.nextProblem('current-id')).resolves.toEqual({ id: 'oldest-id' });
    expect(findFirst).toHaveBeenCalledTimes(3);
  });

  it('falls back to newest overall for single-problem topics', async () => {
    const findFirst = jest.fn();
    findFirst.mockResolvedValueOnce({ topicId: 't1', createdAt: new Date('2026-06-01T00:00:00Z') });
    findFirst.mockResolvedValueOnce(null);
    findFirst.mockResolvedValueOnce(null);
    findFirst.mockResolvedValueOnce({ id: 'fallback-id' });
    const service = setupNext(findFirst);
    await expect(service.nextProblem('current-id')).resolves.toEqual({ id: 'fallback-id' });
  });

  it('returns null when the current problem is missing or unpublished', async () => {
    const findFirst = jest.fn().mockResolvedValueOnce(null);
    const service = setupNext(findFirst);
    await expect(service.nextProblem('missing-id')).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});

describe('ProblemsService.count', () => {
  it('returns the total for the same filters the list uses', async () => {
    const count = jest.fn().mockResolvedValue(42);
    const { service } = setup(count);
    await expect(
      service.count({ ...BASE_QUERY, difficulty: 'EASY' as const }, undefined),
    ).resolves.toEqual({ total: 42 });
    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        AND: expect.arrayContaining([{ status: 'PUBLISHED' }, { difficulty: 'EASY' }]),
      }),
    });
  });

  it('requires sign-in for solved / favorited filters, like list', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const { service } = setup(count);
    await expect(service.count({ ...BASE_QUERY, solved: true }, undefined)).rejects.toBeInstanceOf(
      AuthRequiredError,
    );
    await expect(
      service.count({ ...BASE_QUERY, favorited: true }, undefined),
    ).rejects.toBeInstanceOf(AuthRequiredError);
    expect(count).not.toHaveBeenCalled();
  });
});
