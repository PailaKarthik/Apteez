import { Controller, Get } from '@nestjs/common';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { AdminOverviewService } from './admin-overview.service';
import { callerOf, requireArea } from './admin-access';

/** Operational snapshot. Permission-checked; numbers only, never raw rows. */
@Controller('admin')
export class AdminOverviewController {
  constructor(private readonly overview: AdminOverviewService) {}

  @Get('overview')
  async get(@CurrentUser() user?: RequestUser) {
    requireArea(callerOf(user), 'analytics');
    return this.overview.overview();
  }
}
