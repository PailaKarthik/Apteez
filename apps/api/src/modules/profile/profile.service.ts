import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import type { ProfileDto, PublicProfileDto, RatingPointDto } from '@apteez/types';
import type { ProfileUpdateInput, RatingHistoryProfileQuery } from '@apteez/validation';
import { StorageService } from '../../storage/storage.service';
import { RatingCalculator } from '../rating/rating.calculator';
import { AchievementsService } from './achievements.service';
import { ActivityService } from './activity.service';
import { PerformanceService } from './performance.service';
import {
  AvatarUploadError,
  ProfileForbiddenError,
  ProfileNotFoundError,
  ProfileValidationError,
} from './profile.errors';
import { assertValidTimezone } from './profile.utils';
import { PointsService } from '../rewards/points.service';

export interface UploadedAvatar {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

const AVATAR_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

const hasActiveContent = (value: string): boolean =>
  /<\s*script|javascript\s*:|on\w+\s*=/i.test(value);

/** Magic-byte check so a renamed executable cannot pass as an image. */
function matchesImageSignature(buffer: Buffer, mimetype: string): boolean {
  if (buffer.length < 12) {
    return false;
  }
  if (mimetype === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimetype === 'image/png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }
  if (mimetype === 'image/webp') {
    return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}

/**
 * Owner profile reads/writes and privacy-gated public profiles. Every
 * response uses an explicit DTO — the raw User row never crosses the
 * boundary, so private fields cannot leak through serialization.
 */
@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly performance: PerformanceService,
    private readonly activity: ActivityService,
    private readonly achievements: AchievementsService,
    private readonly points: PointsService,
    private readonly ratings: RatingCalculator,
  ) {}

  async me(userId: string): Promise<ProfileDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new ProfileNotFoundError();
    }
    return this.toProfileDto(user);
  }

  async update(userId: string, input: ProfileUpdateInput): Promise<ProfileDto> {
    if (input.displayName !== undefined && hasActiveContent(input.displayName)) {
      throw new ProfileValidationError('Display name contains disallowed content.');
    }
    if (input.bio !== undefined && hasActiveContent(input.bio)) {
      throw new ProfileValidationError('Bio contains disallowed content.');
    }
    if (input.timezone !== undefined && input.timezone !== null) {
      const timezone = input.timezone.trim();
      if (timezone.length > 0) {
        try {
          assertValidTimezone(timezone);
        } catch {
          throw new ProfileValidationError('Unknown timezone identifier.');
        }
      }
    }
    if (input.username !== undefined) {
      const taken = await this.prisma.user.findFirst({
        where: { username: input.username, id: { not: userId } },
        select: { id: true },
      });
      if (taken) {
        throw new ProfileValidationError('That username is already taken.');
      }
    }
    const emptyToNull = (value: string | undefined): string | null | undefined =>
      value === undefined ? undefined : value.trim().length === 0 ? null : value.trim();
    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
          ...(input.username !== undefined ? { username: input.username.trim() } : {}),
          ...(input.bio !== undefined ? { bio: emptyToNull(input.bio) } : {}),
          ...(input.country !== undefined ? { country: emptyToNull(input.country) } : {}),
          ...(input.institution !== undefined
            ? { institution: emptyToNull(input.institution) }
            : {}),
          ...(input.timezone !== undefined ? { timezone: emptyToNull(input.timezone) } : {}),
          ...(input.isPrivate !== undefined ? { isPrivate: input.isPrivate } : {}),
        },
      });
      // Onboarding reward: a fully completed profile earns once. Source
      // uniqueness on the user id makes repeat updates harmless.
      if (updated.displayName && updated.bio && updated.country && updated.institution) {
        void this.points
          .awardTrigger({ userId, trigger: 'onboarding', sourceType: 'user', sourceId: userId })
          .catch(() => undefined);
      }
      return this.toProfileDto(updated);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new ProfileValidationError('That username is already taken.');
      }
      throw error;
    }
  }

  async uploadAvatar(
    userId: string,
    file: UploadedAvatar | undefined,
  ): Promise<{ avatarKey: string; avatarUrl: string }> {
    if (!file || !file.buffer || file.size === 0) {
      throw new AvatarUploadError('No image was uploaded.');
    }
    if (file.size > AVATAR_MAX_BYTES) {
      throw new AvatarUploadError('Image must be at most 5 MB.');
    }
    const extension = AVATAR_MIME_TYPES[file.mimetype];
    if (!extension) {
      throw new AvatarUploadError('Only JPEG, PNG and WebP images are supported.');
    }
    if (!matchesImageSignature(file.buffer, file.mimetype)) {
      throw new AvatarUploadError('Image content does not match its declared type.');
    }
    const key = `avatars/${userId}/${randomUUID()}.${extension}`;
    await this.storage.upload({ key, body: file.buffer, contentType: file.mimetype });
    const previous = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarKey: true },
    });
    await this.prisma.user.update({ where: { id: userId }, data: { avatarKey: key } });
    if (previous?.avatarKey && previous.avatarKey !== key) {
      // Best-effort cleanup of the replaced object; never fails the upload.
      await this.storage.delete(previous.avatarKey).catch(() => undefined);
    }
    // The bytes are already stored at this point — a transient signing blip
    // must not turn a successful upload into a 500. Fall back to an empty
    // URL; the client refetches the profile (which resolves the URL lazily).
    let avatarUrl = '';
    try {
      avatarUrl = await this.storage.getDownloadUrl(key);
    } catch {
      avatarUrl = '';
    }
    return { avatarKey: key, avatarUrl };
  }

  /** Privacy-gated public identity. Private profiles 404 for strangers. */
  async publicProfile(
    username: string,
    viewer?: { id: string; roles: string[] },
  ): Promise<PublicProfileDto> {
    const user = await this.prisma.user.findFirst({
      where: { username },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarKey: true,
        country: true,
        institution: true,
        bio: true,
        isPrivate: true,
        isActive: true,
        createdAt: true,
      },
    });
    if (!user || !user.isActive || !user.username) {
      throw new ProfileNotFoundError();
    }
    const isOwner = viewer?.id === user.id;
    const isAdmin = viewer?.roles.includes('admin') ?? false;
    if (user.isPrivate && !isOwner && !isAdmin) {
      // Enumeration-safe: strangers cannot distinguish private from missing.
      throw new ProfileNotFoundError();
    }
    const [overall, challengeRatings, contestRating, achievements] = await Promise.all([
      this.performance.overall(user.id),
      this.prisma.challengeRating.findMany({
        where: { userId: user.id },
        select: { rating: true },
      }),
      this.prisma.contestRating.findUnique({
        where: { userId: user.id },
        select: { rating: true },
      }),
      this.achievements.list(user.id),
    ]);
    const bestRating = Math.max(
      0,
      ...challengeRatings.map((row) => row.rating),
      contestRating?.rating ?? 0,
    );
    let avatarUrl: string | null = null;
    if (user.avatarKey) {
      try {
        avatarUrl = await this.storage.getDownloadUrl(user.avatarKey);
      } catch {
        avatarUrl = null;
      }
    }
    return {
      username: user.username,
      displayName: user.displayName,
      avatarKey: user.avatarKey,
      avatarUrl,
      country: user.country,
      institution: user.institution,
      bio: user.bio,
      memberSince: user.createdAt.toISOString(),
      solvedCount: overall.distinctSolved,
      accuracy: overall.accuracy,
      bestRating: bestRating === 0 && overall.totalAttempted === 0 ? null : bestRating,
      tier: bestRating > 0 ? this.ratings.tierFor(bestRating) : null,
      achievements: achievements.filter((row) => row.isUnlocked),
    };
  }

  /** Owner dashboard bundle. Triggers idempotent achievement evaluation. */
  async overview(userId: string): Promise<{
    profile: ProfileDto;
    overall: Awaited<ReturnType<PerformanceService['overall']>>;
    streak: Awaited<ReturnType<ActivityService['streak']>>;
    points: Awaited<ReturnType<PointsService['summary']>>;
    ratings: {
      challenge: Array<{ domainSlug: string; domainName: string; rating: number; tier: string }>;
      contest: { rating: number } | null;
    };
    achievementsUnlocked: number;
    newUnlocks: string[];
  }> {
    const [profile, overall, streak, pointsSummary, challengeRatings, contestRating] =
      await Promise.all([
        this.me(userId),
        this.performance.overall(userId),
        this.activity.streak(userId),
        this.points.summary(userId),
        this.prisma.challengeRating.findMany({
          where: { userId },
          select: { domainSlug: true, rating: true, category: { select: { name: true } } },
        }),
        this.prisma.contestRating.findUnique({ where: { userId }, select: { rating: true } }),
      ]);
    const newUnlocks = await this.achievements.evaluate(userId);
    const unlockedCount = await this.prisma.userAchievement.count({ where: { userId } });
    return {
      profile,
      overall,
      streak,
      points: pointsSummary,
      ratings: {
        challenge: challengeRatings.map((row) => ({
          domainSlug: row.domainSlug,
          domainName: row.category.name,
          rating: row.rating,
          tier: this.ratings.tierFor(row.rating),
        })),
        contest: contestRating ? { rating: contestRating.rating } : null,
      },
      achievementsUnlocked: unlockedCount,
      newUnlocks,
    };
  }

  /** Resolve a username to its user id (active accounts only). */
  async resolveUserId(username: string): Promise<string> {
    const user = await this.prisma.user.findFirst({
      where: { username },
      select: { id: true, isActive: true },
    });
    if (!user || !user.isActive) {
      throw new ProfileNotFoundError();
    }
    return user.id;
  }

  /** Unified rating history across both engines, newest first. Read-only. */
  async ratingHistory(userId: string, query: RatingHistoryProfileQuery): Promise<RatingPointDto[]> {
    const limit = Math.min(Math.max(query.limit, 1), 200);
    const [challenges, contests] = await Promise.all([
      query.source === 'contest'
        ? []
        : this.prisma.challengeRatingHistory.findMany({
            where: { userId },
            orderBy: [{ createdAt: 'desc' }],
            take: limit,
            select: {
              createdAt: true,
              domainSlug: true,
              ratingBefore: true,
              ratingAfter: true,
              ratingChange: true,
            },
          }),
      query.source === 'challenge'
        ? []
        : this.prisma.contestRatingHistory.findMany({
            where: { userId },
            orderBy: [{ createdAt: 'desc' }],
            take: limit,
            select: { createdAt: true, ratingBefore: true, ratingAfter: true, ratingChange: true },
          }),
    ]);
    return [
      ...challenges.map((row) => ({
        date: row.createdAt.toISOString(),
        source: 'challenge' as const,
        domain: row.domainSlug,
        before: row.ratingBefore,
        after: row.ratingAfter,
        change: row.ratingChange,
      })),
      ...contests.map((row) => ({
        date: row.createdAt.toISOString(),
        source: 'contest' as const,
        domain: null,
        before: row.ratingBefore,
        after: row.ratingAfter,
        change: row.ratingChange,
      })),
    ]
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, limit);
  }

  async requireOwnerOrAdmin(
    targetUserId: string,
    caller: { id: string; roles: string[] },
  ): Promise<void> {
    const isOwner = caller.id === targetUserId;
    const isAdmin = caller.roles.includes('admin');
    if (!isOwner && !isAdmin) {
      throw new ProfileForbiddenError('You can only modify your own profile.');
    }
  }

  private async toProfileDto(user: {
    id: string;
    email: string;
    username: string | null;
    displayName: string;
    avatarKey: string | null;
    country: string | null;
    institution: string | null;
    bio: string | null;
    timezone: string | null;
    isPrivate: boolean;
    createdAt: Date;
  }): Promise<ProfileDto> {
    // Avatar URL minting must never fail the whole profile read: after a
    // deploy the storage backend/keys can be briefly unreachable (wrong
    // region, rotated keys, deleted object), and that previously 500'd
    // GET /profile/me — the entire profile page showed a server error.
    // A missing URL degrades to null; the UI falls back to initials.
    let avatarUrl: string | null = null;
    if (user.avatarKey) {
      try {
        avatarUrl = await this.storage.getDownloadUrl(user.avatarKey);
      } catch {
        avatarUrl = null;
      }
    }
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarKey: user.avatarKey,
      avatarUrl,
      country: user.country,
      institution: user.institution,
      bio: user.bio,
      timezone: user.timezone,
      isPrivate: user.isPrivate,
      memberSince: user.createdAt.toISOString(),
    };
  }
}
