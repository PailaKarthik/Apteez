import type { PrismaService } from '@apteez/database';
import {
  InsufficientPointsError,
  RedemptionNotFoundError,
  RedemptionStateError,
  RewardNotAvailableError,
} from './rewards.errors';
import { RewardsService } from './rewards.service';

interface RedemptionRow {
  id: string;
  userId: string;
  rewardId: string;
  pointsCost: number;
  status: string;
  idempotencyKey: string | null;
  createdAt: Date;
  processedAt: Date | null;
  cancelledAt: Date | null;
}

function createFake(stock: number | null = 5, balance = 1000, cost = 500) {
  const redemptions: RedemptionRow[] = [];
  let stockLeft = stock;
  const ledger: Array<{ amount: number; type: string; reason: string }> = [];
  const tx = {
    reward: {
      findUnique: jest.fn(async () => ({
        id: 'r1',
        name: 'Notebook',
        isActive: true,
        pointsCost: cost,
        stockQuantity: stockLeft,
      })),
      updateMany: jest.fn(
        async ({ where }: { where: { stockQuantity?: { gte?: number; not?: null } } }) => {
          if (stockLeft === null) {
            return { count: 1 };
          }
          if (where.stockQuantity && 'gte' in (where.stockQuantity ?? {})) {
            if (stockLeft >= 1) {
              stockLeft -= 1;
              return { count: 1 };
            }
            return { count: 0 };
          }
          if (where.stockQuantity && 'not' in (where.stockQuantity ?? {})) {
            if (stockLeft !== null) {
              stockLeft += 1;
            }
            return { count: 1 };
          }
          return { count: 0 };
        },
      ),
    },
    rewardRedemption: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const rows = redemptions.filter((row) =>
          Object.entries(where).every(
            ([key, value]) => (row as unknown as Record<string, unknown>)[key] === value,
          ),
        );
        return rows.length === 0
          ? null
          : { ...rows[rows.length - 1], reward: { name: 'Notebook' } };
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const row = redemptions.find((candidate) => candidate.id === where.id);
        return row ? { ...row } : null;
      }),
      create: jest.fn(
        async ({
          data,
        }: {
          data: Omit<RedemptionRow, 'id' | 'createdAt' | 'processedAt' | 'cancelledAt'>;
        }) => {
          const row: RedemptionRow = {
            ...data,
            id: `red${redemptions.length}`,
            createdAt: new Date(),
            processedAt: null,
            cancelledAt: null,
          };
          redemptions.push(row);
          return { ...row, reward: { name: 'Notebook' } };
        },
      ),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<RedemptionRow> }) => {
          const row = redemptions.find((candidate) => candidate.id === where.id)!;
          Object.assign(row, data);
          return { ...row, reward: { name: 'Notebook' } };
        },
      ),
    },
  };
  const points = {
    ensureMirror: jest.fn(async () => balance),
    appendEntry: jest.fn(
      async (_tx: unknown, entry: { amount: number; type: string; reason: string }) => {
        ledger.push({ amount: entry.amount, type: entry.type, reason: entry.reason });
        return balance + entry.amount;
      },
    ),
  };
  const prisma = {
    reward: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: tx.reward.findUnique,
    },
    rewardRedemption: {
      ...tx.rewardRedemption,
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    userPoints: { findUnique: jest.fn().mockResolvedValue({ balance }) },
    $transaction: jest.fn(async (fn: (inner: unknown) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaService;
  const storage = { getDownloadUrl: jest.fn().mockResolvedValue('https://cdn.test/reward.png') };
  const events = { notifyUser: jest.fn().mockResolvedValue(undefined) };
  const analytics = { record: jest.fn().mockResolvedValue(undefined) };
  const flags = {
    isEnabled: jest.fn().mockReturnValue(true),
    requireEnabled: jest.fn(),
  };
  const service = new RewardsService(
    prisma,
    points as never,
    storage as never,
    events as never,
    analytics as never,
    flags as never,
  );
  const stockOf = (): number | null => stockLeft;
  return { service, prisma, tx, points, ledger, redemptions, stockOf, events, flags };
}

describe('RewardsService redemption', () => {
  it('redeems transactionally: lock, stock guard, ledger spend, row', async () => {
    const { service, points, ledger, redemptions, stockOf } = createFake(5, 1000, 500);
    const redemption = await service.redeem('u1', 'r1', 'key-1');
    expect(redemption).toMatchObject({ pointsCost: 500, status: 'PENDING' });
    expect(points.ensureMirror).toHaveBeenCalled();
    expect(points.appendEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amount: -500, type: 'SPEND', reason: 'reward:redemption' }),
    );
    expect(ledger).toHaveLength(1);
    expect(redemptions).toHaveLength(1);
    expect(stockOf()).toBe(4);
  });

  it('returns the existing redemption on idempotent retry without charging again', async () => {
    const { service, points, ledger, redemptions } = createFake(5, 1000, 500);
    const first = await service.redeem('u1', 'r1', 'key-1');
    const retry = await service.redeem('u1', 'r1', 'key-1');
    expect(retry.id).toBe(first.id);
    expect(redemptions).toHaveLength(1);
    expect(ledger).toHaveLength(1);
    expect(points.appendEntry).toHaveBeenCalledTimes(1);
  });

  it('serializes the last unit: exactly one concurrent winner', async () => {
    const { service, ledger, redemptions } = createFake(1, 1000, 500);
    const first = await service.redeem('u1', 'r1');
    await expect(service.redeem('u2', 'r1')).rejects.toBeInstanceOf(RewardNotAvailableError);
    expect(first.status).toBe('PENDING');
    expect(redemptions).toHaveLength(1);
    expect(ledger).toHaveLength(1);
  });

  it('refuses redemption server-side when the redemption flag is off', async () => {
    const { service, flags, redemptions } = createFake(5, 1000, 500);
    (flags.requireEnabled as jest.Mock).mockImplementation(() => {
      throw Object.assign(new Error('disabled'), { statusCode: 503 });
    });
    await expect(service.redeem('u1', 'r1')).rejects.toMatchObject({ statusCode: 503 });
    expect(redemptions).toHaveLength(0);
  });

  it('rejects inactive rewards and insufficient balances', async () => {
    const { service, tx } = createFake(5, 100, 500);
    (tx.reward.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'r1',
      name: 'Notebook',
      isActive: false,
      pointsCost: 500,
      stockQuantity: 5,
    });
    await expect(service.redeem('u1', 'r1')).rejects.toBeInstanceOf(RewardNotAvailableError);
    await expect(service.redeem('u1', 'r1')).rejects.toBeInstanceOf(InsufficientPointsError);
  });

  it('cancels pending redemptions with refund and restock', async () => {
    const { service, points, ledger, stockOf } = createFake(5, 1000, 500);
    const created = await service.redeem('u1', 'r1');
    expect(stockOf()).toBe(4);
    const cancelled = await service.cancelMine('u1', created.id);
    expect(cancelled.status).toBe('CANCELLED');
    expect(points.appendEntry).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ amount: 500, type: 'REFUND', reason: 'reward:refund' }),
    );
    expect(ledger.map((row) => row.amount)).toEqual([-500, 500]);
    expect(stockOf()).toBe(5);
  });

  it('refuses to cancel non-pending redemptions and foreign rows', async () => {
    const { service } = createFake(5, 1000, 500);
    const created = await service.redeem('u1', 'r1');
    await expect(service.cancelMine('u2', created.id)).rejects.toBeInstanceOf(
      RedemptionNotFoundError,
    );
    // Simulate admin fulfillment, then owner cancel must fail.
    await service.adminTransition(created.id, 'PROCESSING');
    await service.adminTransition(created.id, 'FULFILLED');
    await expect(service.cancelMine('u1', created.id)).rejects.toBeInstanceOf(RedemptionStateError);
  });

  it('rejects illegal admin transitions and refunds on cancel', async () => {
    const { service, points } = createFake(5, 1000, 500);
    const created = await service.redeem('u1', 'r1');
    await expect(service.adminTransition(created.id, 'FULFILLED')).rejects.toBeInstanceOf(
      RedemptionStateError,
    );
    const cancelled = await service.adminTransition(created.id, 'CANCELLED');
    expect(cancelled.status).toBe('CANCELLED');
    expect(points.appendEntry).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ amount: 500, type: 'REFUND' }),
    );
  });

  it('scopes redemption reads to the owner', async () => {
    const { service } = createFake(5, 1000, 500);
    const created = await service.redeem('u1', 'r1');
    await expect(service.myRedemption('u2', created.id)).rejects.toBeInstanceOf(
      RedemptionNotFoundError,
    );
    await expect(service.myRedemption('u1', created.id)).resolves.toMatchObject({ id: created.id });
  });
});
