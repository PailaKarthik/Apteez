import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  adminReportResolveSchema,
  adminReportsQuerySchema,
  reportCreateSchema,
  type AdminReportResolveInput,
  type AdminReportsQuery,
  type ReportCreateInput,
} from '@apteez/validation';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthRequiredError } from '../auth/auth.errors';
import { AdminReportsService } from './admin-reports.service';
import { callerOf, requireAnyArea } from './admin-access';

/** User-facing report filing. Rate-limited; duplicates collide idempotently. */
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: AdminReportsService) {}

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post()
  async file(
    @Body(new ZodValidationPipe(reportCreateSchema)) body: ReportCreateInput,
    @CurrentUser() user?: RequestUser,
  ) {
    if (!user) {
      throw new AuthRequiredError('Sign in to file a report.');
    }
    return this.reports.file(body, user.id);
  }
}

/** Staff report triage. Resolution notifies the reporter. */
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly reports: AdminReportsService) {}

  @Get()
  async queue(
    @Query(new ZodValidationPipe(adminReportsQuerySchema)) query: AdminReportsQuery,
    @CurrentUser() user?: RequestUser,
  ) {
    // Discussion moderators triage discussion targets; analysts triage all.
    requireAnyArea(callerOf(user), ['discussions', 'analytics']);
    return this.reports.queue(query);
  }

  @Get(':id')
  async detail(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ) {
    requireAnyArea(callerOf(user), ['discussions', 'analytics']);
    return this.reports.one(id);
  }

  @Patch(':id')
  async resolve(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(adminReportResolveSchema)) body: AdminReportResolveInput,
    @CurrentUser() user?: RequestUser,
    @Ip() ip?: string,
  ) {
    const caller = requireAnyArea(callerOf(user), ['discussions', 'analytics']);
    return this.reports.resolve(id, body, caller, ip);
  }
}
