import { Controller, Get } from '@nestjs/common';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { FeatureFlagsService, type FlagState } from '../../config/feature-flags';
import { callerOf, requireArea } from './admin-access';

/**
 * Operator view of effective feature-flag configuration. Read-only by
 * design: changing a flag is a redeploy (see docs/feature-flags.md), so
 * there is no mutation endpoint to secure or audit.
 */
@Controller('admin/flags')
export class AdminFlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  @Get()
  async describe(@CurrentUser() user?: RequestUser): Promise<{ flags: FlagState[] }> {
    requireArea(callerOf(user), 'analytics');
    return { flags: this.flags.describe() };
  }
}
