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
