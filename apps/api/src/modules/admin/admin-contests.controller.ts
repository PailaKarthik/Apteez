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
  adminContestPatchSchema,
  adminContestsQuerySchema,
  paginationSchema,
  type AdminContestPatchInput,
  type AdminContestsQuery,
  type PaginationInput,
} from '@apteez/validation';
import { z } from 'zod';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminContestsService } from './admin-contests.service';
import { callerOf, requireArea } from './admin-access';

const cancelSchema = z.object({ reason: z.string().trim().min(5).max(500) });

/** Contest operations. Rankings stay owned by ContestService — read here, never rewritten. */
@Controller('admin/contests')
export class AdminContestsController {
  constructor(private readonly contests: AdminContestsService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(adminContestsQuerySchema)) query: AdminContestsQuery,
    @CurrentUser() user?: RequestUser,
  ) {
    requireArea(callerOf(user), 'contests');
    return this.contests.list(query);
  }

  @Get(':id/participants')
  async participants(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query(new ZodValidationPipe(paginationSchema)) query: PaginationInput,
    @CurrentUser() user?: RequestUser,
  ) {
    requireArea(callerOf(user), 'contests');
    return this.contests.participants(id, query.page, query.pageSize);
  }

  @Get(':id/suspicious')
  async suspicious(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query(new ZodValidationPipe(paginationSchema)) query: PaginationInput,
    @CurrentUser() user?: RequestUser,
  ) {
    requireArea(callerOf(user), 'contests');
    return this.contests.suspicious(id, query.page, query.pageSize);
  }

  @Patch(':id')
  async updateMeta(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(adminContestPatchSchema)) body: AdminContestPatchInput,
    @CurrentUser() user?: RequestUser,
    @Ip() ip?: string,
  ) {
    const caller = requireArea(callerOf(user), 'contests');
    return this.contests.updateMeta(id, body, caller, ip);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post(':id/cancel')
  async cancel(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(cancelSchema)) body: { reason: string },
    @CurrentUser() user?: RequestUser,
    @Ip() ip?: string,
  ) {
    const caller = requireArea(callerOf(user), 'contests');
    return this.contests.cancel(id, body.reason, caller, ip);
  }
}
