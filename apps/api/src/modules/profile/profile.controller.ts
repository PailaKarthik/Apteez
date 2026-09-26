import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  activityRangeSchema,
  profileUpdateSchema,
  ratingHistoryProfileQuerySchema,
  recentActivityQuerySchema,
  type ActivityRangeQuery,
  type ProfileUpdateInput,
  type RatingHistoryProfileQuery,
  type RecentActivityQuery,
} from '@apteez/validation';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthRequiredError } from '../auth/auth.errors';
import { AchievementsService } from './achievements.service';
import { ActivityService } from './activity.service';
import { AvatarUploadError } from './profile.errors';
import { PerformanceService } from './performance.service';
import { ProfileService, type UploadedAvatar } from './profile.service';
import { PointsService } from '../rewards/points.service';

function requireCaller(user?: RequestUser): { id: string; roles: string[]; permissions: string[] } {
  if (!user) {
    throw new AuthRequiredError('Sign in to view your profile.');
  }
  return { id: user.id, roles: user.roles, permissions: user.permissions };
}

/** Owner profile + analytics. Every route is session-authenticated by default. */
@Controller('profile')
export class ProfileController {
  constructor(
    private readonly profile: ProfileService,
    private readonly performance: PerformanceService,
    private readonly activity: ActivityService,
    private readonly achievements: AchievementsService,
    private readonly points: PointsService,
  ) {}

  @Get('me')
  async me(@CurrentUser() user?: RequestUser) {
    return this.profile.me(requireCaller(user).id);
  }

  @Patch('me')
  async update(
    @Body(new ZodValidationPipe(profileUpdateSchema)) body: ProfileUpdateInput,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.profile.update(requireCaller(user).id, body);
  }

  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
      fileFilter: (
        _req,
        file: { mimetype: string },
        callback: (error: Error | null, accept: boolean) => void,
      ) => {
        if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
          callback(null, true);
        } else {
          callback(new AvatarUploadError('Only JPEG, PNG and WebP images are supported.'), false);
        }
      },
    }),
  )
  async uploadAvatar(
    @UploadedFile() file: UploadedAvatar | undefined,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.profile.uploadAvatar(requireCaller(user).id, file);
  }

  @Get('me/overview')
  async overview(@CurrentUser() user?: RequestUser) {
    return this.profile.overview(requireCaller(user).id);
  }

  @Get('me/performance')
  async performanceOverall(@CurrentUser() user?: RequestUser) {
    return this.performance.overall(requireCaller(user).id);
  }

  @Get('me/performance/domains')
  async domains(@CurrentUser() user?: RequestUser) {
    return { items: await this.performance.byDomain(requireCaller(user).id) };
  }

  @Get('me/performance/topics')
  async topics(@CurrentUser() user?: RequestUser) {
    return { items: await this.performance.byTopic(requireCaller(user).id) };
  }

  @Get('me/performance/difficulties')
  async difficulties(@CurrentUser() user?: RequestUser) {
    return { items: await this.performance.byDifficulty(requireCaller(user).id) };
  }

  @Get('me/performance/weak-areas')
  async weakAreas(@CurrentUser() user?: RequestUser) {
    return { items: await this.performance.weakAreas(requireCaller(user).id) };
  }

  @Get('me/rating-history')
  async ratingHistory(
    @Query(new ZodValidationPipe(ratingHistoryProfileQuerySchema)) query: RatingHistoryProfileQuery,
    @CurrentUser() user?: RequestUser,
  ) {
    return { items: await this.profile.ratingHistory(requireCaller(user).id, query) };
  }

  @Get('me/activity')
  async heatmap(
    @Query(new ZodValidationPipe(activityRangeSchema)) query: ActivityRangeQuery,
    @CurrentUser() user?: RequestUser,
  ) {
    return { items: await this.activity.heatmap(requireCaller(user).id, query.days) };
  }

  @Get('me/activity/recent')
  async recent(
    @Query(new ZodValidationPipe(recentActivityQuerySchema)) query: RecentActivityQuery,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.activity.recentActivity(requireCaller(user).id, query.page, query.pageSize);
  }

  @Get('me/streak')
  async streak(@CurrentUser() user?: RequestUser) {
    return this.activity.streak(requireCaller(user).id);
  }

  @Get('me/achievements')
  async achievementList(@CurrentUser() user?: RequestUser) {
    const caller = requireCaller(user);
    const newly = await this.achievements.evaluate(caller.id);
    return { items: await this.achievements.list(caller.id), newlyUnlocked: newly };
  }

  @Get('me/points')
  async pointsSummary(@CurrentUser() user?: RequestUser) {
    return this.points.summary(requireCaller(user).id);
  }

  @Get('me/contributions')
  async contributions(@CurrentUser() user?: RequestUser) {
    return this.activity.contributions(requireCaller(user).id);
  }

  @Get('me/events')
  async events(@CurrentUser() user?: RequestUser) {
    return this.activity.profileEvents(requireCaller(user).id);
  }

  @Get('me/next-focus')
  async nextFocus(@CurrentUser() user?: RequestUser) {
    return this.activity.nextFocus(requireCaller(user).id);
  }
}
