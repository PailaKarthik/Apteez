import { RewardsAdminController } from './rewards-admin.controller';

const ADMIN = { id: 'admin1', roles: ['admin'], permissions: ['manage:rewards'] };
const PLATFORM_ADMIN = { id: 'root', roles: ['admin'], permissions: ['manage:platform'] };
const MEMBER = { id: 'u1', roles: ['user'], permissions: [] };

function createController() {
  const points = {
    adjust: jest.fn().mockResolvedValue({ balance: 100 }),
    history: jest.fn().mockResolvedValue({ items: [] }),
    verify: jest.fn().mockResolvedValue({ consistent: true }),
  };
  const rewards = {
    adminListRewards: jest.fn().mockResolvedValue([]),
    adminListRules: jest.fn().mockResolvedValue([]),
    adminCreate: jest.fn(),
    adminUpdate: jest.fn(),
    adminSetStock: jest.fn(),
    adminRedemptions: jest.fn(),
    adminTransition: jest.fn(),
    suspicious: jest.fn().mockResolvedValue([]),
  };
  const controller = new RewardsAdminController(points as never, rewards as never);
  return { controller, points, rewards };
}

describe('RewardsAdminController authorization', () => {
  it('rejects unauthenticated callers', async () => {
    const { controller } = createController();
    await expect(controller.suspicious(undefined)).rejects.toMatchObject({ statusCode: 401 });
    await expect(
      controller.adjust('u1', { amount: 10, reason: 'test reason' }, undefined),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects ordinary users on every admin route', async () => {
    const { controller } = createController();
    await expect(controller.suspicious(MEMBER as never)).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      controller.adjust('u1', { amount: 10, reason: 'test reason' }, MEMBER as never),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      controller.createReward({ name: 'X', category: 'merch', pointsCost: 10 }, MEMBER as never),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('admits area permission and the platform bypass', async () => {
    const { controller, rewards } = createController();
    await expect(controller.suspicious(ADMIN as never)).resolves.toEqual({ items: [] });
    await expect(controller.suspicious(PLATFORM_ADMIN as never)).resolves.toEqual({ items: [] });
    expect(rewards.suspicious).toHaveBeenCalledTimes(2);
  });

  it('gates rule and achievement management to reward admins', async () => {
    const { controller } = createController();
    await expect(controller.listRules(MEMBER as never)).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      controller.createRule(
        { key: 'x', name: 'X', trigger: 'problem-solve', points: 5, category: 'activity' },
        MEMBER as never,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(controller.listRules(ADMIN as never)).resolves.toEqual({ items: [] });
    await expect(
      controller.updateAchievement('a1', { points: 10 }, MEMBER as never),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('forwards the validated adjustment amount with the admin actor attached', async () => {
    const { controller, points } = createController();
    await controller.adjust(
      'u1',
      { amount: -50, reason: 'duplicate grant reversal' },
      ADMIN as never,
    );
    expect(points.adjust).toHaveBeenCalledWith({
      userId: 'u1',
      amount: -50,
      reason: 'duplicate grant reversal',
      adminId: 'admin1',
    });
  });
});
