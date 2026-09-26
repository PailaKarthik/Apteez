import type { PrismaService } from '@apteez/database';
import { PointsService } from './points.service';

interface LedgerRow {
  id: string;
  userId: string;
  amount: number;
  type: string;
  reason: string;
  referenceId: string | null;
  sourceType: string | null;
  sourceId: string | null;
  balanceAfter: number;
  createdAt: Date;
}

interface Mirror {
  balance: number;
  earned: number;
  spent: number;
}

const RULES = [
  {
    key: 'onboarding',
    name: 'Onboarding Completed',
    points: 50,
    category: 'onboarding',
    dailyCap: 1,
    isActive: true,
  },
  {
    key: 'problem-solve',
    name: 'Problem Solved',
    points: 5,
    category: 'activity',
    dailyCap: 20,
    isActive: true,
  },
];

/** Faithful in-memory ledger: mirror stays in lockstep, balances derive from rows. */
function createFake(
  rules: Array<{
    key: string;
    name: string;
    points: number;
    category: string;
    trigger?: string;
    dailyCap?: number | null;
    maxPerUser?: number | null;
    cooldownSeconds?: number | null;
    isActive: boolean;
  }> = RULES,
) {
  const ledger: LedgerRow[] = [];
  const mirrors = new Map<string, Mirror>();
  const mirrorOf = (userId: string): Mirror => {
    let mirror = mirrors.get(userId);
    if (!mirror) {
      mirror = { balance: 0, earned: 0, spent: 0 };
      mirrors.set(userId, mirror);
    }
    return mirror;
  };
  const matches = (row: LedgerRow, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (key === 'createdAt' && typeof value === 'object' && value !== null) {
        const gte = (value as { gte?: Date }).gte;
        return !gte || row.createdAt >= gte;
      }
      return (row as unknown as Record<string, unknown>)[key] === value;
    });
  const tx = {
    pointTransaction: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const rows = ledger.filter((row) => matches(row, where));
        return rows.length === 0 ? null : rows[rows.length - 1];
      }),
      count: jest.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          ledger.filter((row) => matches(row, where)).length,
      ),
      create: jest.fn(async ({ data }: { data: Omit<LedgerRow, 'id' | 'createdAt'> }) => {
        const row: LedgerRow = { ...data, id: `t${ledger.length}`, createdAt: new Date() };
        ledger.push(row);
        return row;
      }),
    },
    userPoints: {
      upsert: jest.fn(async ({ where }: { where: { userId: string } }) => mirrorOf(where.userId)),
      update: jest.fn(
        async ({ where, data }: { where: { userId: string }; data: Record<string, unknown> }) => {
          const mirror = mirrorOf(where.userId);
          if (typeof data.balance === 'number') {
            mirror.balance = data.balance;
          }
          const increment = (field: 'earned' | 'spent', value: unknown): void => {
            if (typeof value === 'object' && value !== null && 'increment' in value) {
              mirror[field] += (value as { increment: number }).increment;
            }
          };
          increment('earned', (data as { lifetimeEarned?: unknown }).lifetimeEarned);
          increment('spent', (data as { lifetimeSpent?: unknown }).lifetimeSpent);
          return mirror;
        },
      ),
      findUnique: jest.fn(async ({ where }: { where: { userId: string } }) => {
        const mirror = mirrors.get(where.userId);
        return mirror
          ? { balance: mirror.balance, lifetimeEarned: mirror.earned, lifetimeSpent: mirror.spent }
          : null;
      }),
    },
    $queryRaw: jest.fn(async () => [{ balance: mirrorOf('u1').balance }]),
  };
  const prisma = {
    pointTransaction: {
      ...tx.pointTransaction,
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
    },
    userPoints: tx.userPoints,
    rewardRule: { findMany: jest.fn().mockResolvedValue(rules) },
    $transaction: jest.fn(async (fn: (inner: unknown) => Promise<unknown>) => fn(tx)),
    $queryRaw: tx.$queryRaw,
  } as unknown as PrismaService;
  const service = new PointsService(prisma);
  return { service, prisma, ledger, mirrors, tx };
}

describe('PointsService ledger', () => {
  it('awards once and replays the same reference idempotently', async () => {
    const { service, ledger } = createFake();
    const first = await service.awardOnce({
      userId: 'u1',
      amount: 50,
      reason: 'achievement:unlock',
      referenceId: 'first-solve',
    });
    expect(first).toEqual({ awarded: true, balance: 50 });
    const retry = await service.awardOnce({
      userId: 'u1',
      amount: 50,
      reason: 'achievement:unlock',
      referenceId: 'first-solve',
    });
    expect(retry).toEqual({ awarded: false, balance: 50 });
    expect(ledger).toHaveLength(1);
  });

  it('treats unique-constraint races as duplicates, never double-paying', async () => {
    const { service, prisma, ledger, mirrors } = createFake();
    // The concurrent winner committed first: mirror already reflects it.
    mirrors.set('u1', { balance: 50, earned: 50, spent: 0 });
    (prisma.$transaction as jest.Mock).mockImplementationOnce(
      async (fn: (inner: unknown) => Promise<unknown>) =>
        fn({
          pointTransaction: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest
              .fn()
              .mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' })),
          },
          userPoints: { upsert: jest.fn(), update: jest.fn() },
          $queryRaw: jest.fn().mockResolvedValue([{ balance: 50 }]),
        }),
    );
    await expect(
      service.awardOnce({
        userId: 'u1',
        amount: 50,
        reason: 'achievement:unlock',
        referenceId: 'race',
      }),
    ).resolves.toEqual({ awarded: false, balance: 50 });
    expect(ledger).toHaveLength(0);
  });

  it('rejects non-positive and excessive awards', async () => {
    const { service } = createFake();
    await expect(service.awardOnce({ userId: 'u1', amount: 0, reason: 'x' })).rejects.toThrow();
    await expect(service.awardOnce({ userId: 'u1', amount: -5, reason: 'x' })).rejects.toThrow();
    await expect(
      service.awardOnce({ userId: 'u1', amount: 999_999, reason: 'x' }),
    ).rejects.toThrow();
  });

  it('reports totals from the mirror with lifetime fields', async () => {
    const { service } = createFake();
    await service.awardOnce({
      userId: 'u1',
      amount: 50,
      reason: 'achievement:unlock',
      referenceId: 'a',
    });
    await expect(service.summary('u1')).resolves.toMatchObject({
      total: 50,
      earned: 50,
      lifetimeEarned: 50,
      lifetimeSpent: 0,
    });
  });
});

describe('PointsService rules', () => {
  it('resolves amounts server-side and rejects unknown rules', async () => {
    const { service } = createFake();
    const awarded = await service.awardRule({
      userId: 'u1',
      ruleKey: 'problem-solve',
      sourceType: 'submission',
      sourceId: 's1',
    });
    expect(awarded).toMatchObject({ awarded: true, capped: false, balance: 5 });
    await expect(
      service.awardRule({ userId: 'u1', ruleKey: 'nope', sourceType: 'x', sourceId: 'y' }),
    ).rejects.toThrow('Unknown or inactive reward rule');
  });

  it('awards each source once even across retries', async () => {
    const { service, ledger } = createFake();
    await service.awardRule({
      userId: 'u1',
      ruleKey: 'problem-solve',
      sourceType: 'submission',
      sourceId: 's1',
    });
    const retry = await service.awardRule({
      userId: 'u1',
      ruleKey: 'problem-solve',
      sourceType: 'submission',
      sourceId: 's1',
    });
    expect(retry).toMatchObject({ awarded: false, capped: false, balance: 5 });
    expect(ledger).toHaveLength(1);
  });

  it('enforces the daily cap without blocking other rules', async () => {
    const { service } = createFake([
      {
        key: 'problem-solve',
        name: 'Problem Solved',
        points: 5,
        category: 'activity',
        dailyCap: 2,
        isActive: true,
      },
      {
        key: 'onboarding',
        name: 'Onboarding',
        points: 50,
        category: 'onboarding',
        dailyCap: 1,
        isActive: true,
      },
    ]);
    await service.awardRule({
      userId: 'u1',
      ruleKey: 'problem-solve',
      sourceType: 'submission',
      sourceId: 's1',
    });
    await service.awardRule({
      userId: 'u1',
      ruleKey: 'problem-solve',
      sourceType: 'submission',
      sourceId: 's2',
    });
    const capped = await service.awardRule({
      userId: 'u1',
      ruleKey: 'problem-solve',
      sourceType: 'submission',
      sourceId: 's3',
    });
    expect(capped).toMatchObject({ awarded: false, capped: true, balance: 10 });
    // A different rule still pays.
    const other = await service.awardRule({
      userId: 'u1',
      ruleKey: 'onboarding',
      sourceType: 'user',
      sourceId: 'u1',
    });
    expect(other).toMatchObject({ awarded: true, balance: 60 });
  });

  it('fans one trigger out to every active rule sharing it', async () => {
    const { service, ledger } = createFake([
      {
        key: 'problem-solve',
        name: 'Problem Solved',
        points: 5,
        category: 'activity',
        trigger: 'problem-solve',
        dailyCap: 20,
        isActive: true,
      },
      {
        key: 'solve-bonus',
        name: 'Solve Bonus',
        points: 3,
        category: 'activity',
        trigger: 'problem-solve',
        dailyCap: 20,
        isActive: true,
      },
    ]);
    const outcome = await service.awardTrigger({
      userId: 'u1',
      trigger: 'problem-solve',
      sourceType: 'submission',
      sourceId: 's1',
    });
    expect(outcome).toMatchObject({ awarded: true, awardedCount: 2, balance: 8 });
    expect(ledger).toHaveLength(2);
    // Same source never pays either rule twice.
    const retry = await service.awardTrigger({
      userId: 'u1',
      trigger: 'problem-solve',
      sourceType: 'submission',
      sourceId: 's1',
    });
    expect(retry).toMatchObject({ awarded: false, awardedCount: 0 });
    expect(ledger).toHaveLength(2);
  });

  it('ignores unknown triggers silently and enforces lifetime caps', async () => {
    const { service, ledger } = createFake([
      {
        key: 'one-time',
        name: 'One Time',
        points: 7,
        category: 'milestone',
        trigger: 'one-time',
        dailyCap: null,
        maxPerUser: 1,
        isActive: true,
      },
    ]);
    const unknown = await service.awardTrigger({
      userId: 'u1',
      trigger: 'no-such-trigger',
      sourceType: 'x',
      sourceId: 'y',
    });
    expect(unknown).toMatchObject({ awarded: false, awardedCount: 0 });
    const first = await service.awardTrigger({
      userId: 'u1',
      trigger: 'one-time',
      sourceType: 'a',
      sourceId: '1',
    });
    expect(first).toMatchObject({ awarded: true, awardedCount: 1 });
    const second = await service.awardTrigger({
      userId: 'u1',
      trigger: 'one-time',
      sourceType: 'a',
      sourceId: '2',
    });
    expect(second).toMatchObject({ awarded: false, awardedCount: 0 });
    expect(ledger).toHaveLength(1);
  });

  it('enforces per-rule cooldowns', async () => {
    const { service, ledger } = createFake([
      {
        key: 'slow-bonus',
        name: 'Slow Bonus',
        points: 4,
        category: 'activity',
        trigger: 'slow-bonus',
        dailyCap: null,
        cooldownSeconds: 3600,
        isActive: true,
      },
    ]);
    await service.awardTrigger({
      userId: 'u1',
      trigger: 'slow-bonus',
      sourceType: 'a',
      sourceId: '1',
    });
    const cooled = await service.awardTrigger({
      userId: 'u1',
      trigger: 'slow-bonus',
      sourceType: 'a',
      sourceId: '2',
    });
    expect(cooled).toMatchObject({ awarded: false });
    expect(ledger).toHaveLength(1);
  });
});

describe('PointsService spend/adjust/verify', () => {
  it('refuses spends beyond the balance and never goes negative', async () => {
    const { service } = createFake();
    await service.awardOnce({
      userId: 'u1',
      amount: 40,
      reason: 'achievement:unlock',
      referenceId: 'a',
    });
    await expect(
      service.spend({ userId: 'u1', amount: 41, reason: 'reward:redemption', description: 'x' }),
    ).rejects.toThrow('Insufficient');
    const spent = await service.spend({
      userId: 'u1',
      amount: 40,
      reason: 'reward:redemption',
      description: 'x',
    });
    expect(spent).toEqual({ balance: 0 });
    await expect(service.summary('u1')).resolves.toMatchObject({
      total: 0,
      lifetimeEarned: 40,
      lifetimeSpent: 40,
    });
  });

  it('audits admin adjustments and blocks negative balances', async () => {
    const { service, ledger } = createFake();
    const added = await service.adjust({
      userId: 'u1',
      amount: 100,
      reason: 'goodwill credit',
      adminId: 'admin1',
    });
    expect(added).toEqual({ balance: 100 });
    expect(ledger[0]).toMatchObject({ type: 'ADJUST', metadata: { adminId: 'admin1' } });
    await expect(
      service.adjust({ userId: 'u1', amount: -101, reason: 'clawback', adminId: 'admin1' }),
    ).rejects.toThrow();
    await expect(
      service.adjust({ userId: 'u1', amount: 0, reason: 'noop', adminId: 'admin1' }),
    ).rejects.toThrow();
  });

  it('verifies mirror consistency against the ledger sum', async () => {
    const { service, mirrors } = createFake();
    await service.awardOnce({
      userId: 'u1',
      amount: 30,
      reason: 'achievement:unlock',
      referenceId: 'a',
    });
    // Rebuild the aggregate mock from the fake ledger for verify().
    const sum = 30;
    (
      service as unknown as { prisma: { pointTransaction: { aggregate: jest.Mock } } }
    ).prisma.pointTransaction.aggregate = jest.fn().mockResolvedValue({ _sum: { amount: sum } });
    await expect(service.verify('u1')).resolves.toMatchObject({
      consistent: true,
      balance: 30,
      ledgerSum: 30,
    });
    mirrors.get('u1')!.balance = 999;
    await expect(service.verify('u1')).resolves.toMatchObject({ consistent: false });
  });
});
