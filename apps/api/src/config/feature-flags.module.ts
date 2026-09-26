import { Global, Module } from '@nestjs/common';
import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { Controller, Get } from '@nestjs/common';
import { OptionalAuth } from '../common/decorators/auth.decorator';
import { FeatureFlagsService, type FeatureFlagKey } from './feature-flags';

/**
 * Public flag snapshot for UX gating (booleans only — rollout bucketing is
 * evaluated server-side per caller). Enforcement lives in the domain
 * services; this endpoint only tells the client what to hide.
 */
@Controller('flags')
export class FlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  @OptionalAuth()
  @Get()
  async snapshot(
    @CurrentUser() user?: RequestUser,
  ): Promise<{ flags: Record<FeatureFlagKey, boolean> }> {
    return { flags: this.flags.snapshot(user?.id) };
  }
}

/**
 * Global so every domain service can gate without importing. Config +
 * logger are global already, so this adds no dependency cycles.
 */
@Global()
@Module({
  controllers: [FlagsController],
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
