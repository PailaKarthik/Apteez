import { Controller, Get, Param } from '@nestjs/common';
import { usernameParamSchema } from '@apteez/validation';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { OptionalAuth } from '../../common/decorators/auth.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ActivityService } from './activity.service';
import { ProfileService } from './profile.service';

/**
 * Public competitive identities. Explicit public DTOs only; private
 * profiles are indistinguishable from missing ones for strangers.
 */
@Controller('users')
export class UsersController {
  constructor(
    private readonly profile: ProfileService,
    private readonly activity: ActivityService,
  ) {}

  @OptionalAuth()
  @Get(':username')
  async byUsername(
    @Param(new ZodValidationPipe(usernameParamSchema)) params: { username: string },
    @CurrentUser() user?: RequestUser,
  ) {
    return this.profile.publicProfile(
      params.username,
      user ? { id: user.id, roles: user.roles } : undefined,
    );
  }

  @OptionalAuth()
  @Get(':username/overview')
  async overview(
    @Param(new ZodValidationPipe(usernameParamSchema)) params: { username: string },
    @CurrentUser() user?: RequestUser,
  ) {
    const viewer = user ? { id: user.id, roles: user.roles } : undefined;
    const profile = await this.profile.publicProfile(params.username, viewer);
    // Heatmap counts only — breakdowns stay private. The gate above already
    // rejected strangers for private profiles.
    const ownerId = await this.profile.resolveUserId(params.username);
    return { profile, activity: await this.activity.heatmap(ownerId, 182) };
  }
}
