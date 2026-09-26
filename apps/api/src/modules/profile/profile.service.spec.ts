import type { PrismaService } from '@apteez/database';
import { ProfileNotFoundError, ProfileValidationError } from './profile.errors';
import { ProfileService } from './profile.service';

function createService() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    challengeRating: { findMany: jest.fn().mockResolvedValue([]) },
    contestRating: { findUnique: jest.fn().mockResolvedValue(null) },
    userAchievement: { count: jest.fn().mockResolvedValue(0) },
  } as unknown as PrismaService;
  const storage = {
    upload: jest.fn(),
    delete: jest.fn().mockResolvedValue(undefined),
    getDownloadUrl: jest.fn().mockResolvedValue('https://cdn.test/avatar.png'),
  };
  const performance = { overall: jest.fn() };
  const activity = { streak: jest.fn() };
  const achievements = {
    list: jest.fn().mockResolvedValue([]),
    evaluate: jest.fn().mockResolvedValue([]),
  };
  const points = { summary: jest.fn() };
  const ratings = { tierFor: jest.fn().mockReturnValue('INTERMEDIATE') };
  const service = new ProfileService(
    prisma,
    storage as never,
    performance as never,
    activity as never,
    achievements as never,
    points as never,
    ratings as never,
  );
  return { service, prisma, storage, performance };
}

const OWNER = {
  id: 'u1',
  email: 'ada@example.com',
  username: 'ada',
  displayName: 'Ada',
  avatarKey: null,
  country: 'India',
  institution: 'IIT',
  bio: 'Solver',
  timezone: null,
  isPrivate: false,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('ProfileService', () => {
  it('rejects unknown timezones and taken usernames on update', async () => {
    const { service } = createService();
    await expect(service.update('u1', { timezone: 'Mars/Olympus' })).rejects.toBeInstanceOf(
      ProfileValidationError,
    );
    const { service: taken, prisma } = createService();
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'other' });
    await expect(taken.update('u1', { username: 'taken-name' })).rejects.toThrow('already taken');
  });

  it('maps concurrent username races to a taken-username error', async () => {
    const { service, prisma } = createService();
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.user.update as jest.Mock).mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' }),
    );
    await expect(service.update('u1', { username: 'race' })).rejects.toThrow('already taken');
  });

  it('hides private profiles from strangers but shows them to the owner', async () => {
    const { service, prisma, performance } = createService();
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({ ...OWNER, isPrivate: true });
    (performance.overall as jest.Mock).mockResolvedValue({
      distinctSolved: 3,
      accuracy: 66.7,
      totalAttempted: 3,
    });
    await expect(
      service.publicProfile('ada', { id: 'stranger', roles: ['user'] }),
    ).rejects.toBeInstanceOf(ProfileNotFoundError);
    await expect(
      service.publicProfile('ada', { id: 'u1', roles: ['user'] }),
    ).resolves.toMatchObject({ username: 'ada' });
  });

  it('never exposes email addresses on public profiles', async () => {
    const { service, prisma, performance } = createService();
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(OWNER);
    (performance.overall as jest.Mock).mockResolvedValue({
      distinctSolved: 3,
      accuracy: 66.7,
      totalAttempted: 3,
    });
    const profile = await service.publicProfile('ada');
    expect(profile).not.toHaveProperty('email');
    expect(profile).not.toHaveProperty('isPrivate');
    expect(profile).toMatchObject({ username: 'ada', displayName: 'Ada', solvedCount: 3 });
  });

  it('rejects oversized and non-image avatar uploads', async () => {
    const { service } = createService();
    await expect(service.uploadAvatar('u1', undefined)).rejects.toThrow('No image');
    await expect(
      service.uploadAvatar('u1', {
        buffer: Buffer.alloc(10),
        mimetype: 'image/gif',
        size: 10,
        originalname: 'a.gif',
      }),
    ).rejects.toThrow('Only JPEG, PNG and WebP');
    await expect(
      service.uploadAvatar('u1', {
        buffer: Buffer.alloc(10),
        mimetype: 'image/png',
        size: 6 * 1024 * 1024,
        originalname: 'a.png',
      }),
    ).rejects.toThrow('at most 5 MB');
  });
});
