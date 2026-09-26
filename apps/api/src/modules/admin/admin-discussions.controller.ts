import { Body, Controller, Get, Ip, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { paginationSchema, type PaginationInput } from '@apteez/validation';
import { z } from 'zod';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminDiscussionsService } from './admin-discussions.service';
import { callerOf, requireArea } from './admin-access';

const reportStatusQuerySchema = z.object({
  status: z.enum(['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const reportStatusBodySchema = z.object({
  status: z.enum(['REVIEWING', 'RESOLVED', 'DISMISSED']),
});

const moderationNoteSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

/** Discussion moderation: report triage, hide/restore, lock. All audited. */
@Controller('admin/discussions')
export class AdminDiscussionsController {
  constructor(private readonly moderation: AdminDiscussionsService) {}

  @Get('reports')
  async reports(
    @Query(new ZodValidationPipe(reportStatusQuerySchema))
    query: {
      status?: 'OPEN' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED';
      page: number;
      pageSize: number;
    },
    @CurrentUser() user?: RequestUser,
  ) {
    requireArea(callerOf(user), 'discussions');
    return this.moderation.reports(query.status, query.page, query.pageSize);
  }

  @Post('reports/:id/status')
  async setReportStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(reportStatusBodySchema))
    body: { status: 'REVIEWING' | 'RESOLVED' | 'DISMISSED' },
    @CurrentUser() user?: RequestUser,
    @Ip() ip?: string,
  ) {
    const caller = requireArea(callerOf(user), 'discussions');
    return this.moderation.setReportStatus(id, body.status, caller, ip);
  }

  @Post('posts/:id/hide')
  async hidePost(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(moderationNoteSchema)) body: { reason?: string },
    @CurrentUser() user?: RequestUser,
    @Ip() ip?: string,
  ) {
    const caller = requireArea(callerOf(user), 'discussions');
    return this.moderation.hidePost(id, caller, ip, body.reason);
  }

  @Post('posts/:id/restore')
  async restorePost(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
    @Ip() ip?: string,
  ) {
    const caller = requireArea(callerOf(user), 'discussions');
    return this.moderation.restorePost(id, caller, ip);
  }

  @Post('posts/:id/lock')
  async lock(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
    @Ip() ip?: string,
  ) {
    const caller = requireArea(callerOf(user), 'discussions');
    return this.moderation.setLocked(id, true, caller, ip);
  }

  @Post('posts/:id/unlock')
  async unlock(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
    @Ip() ip?: string,
  ) {
    const caller = requireArea(callerOf(user), 'discussions');
    return this.moderation.setLocked(id, false, caller, ip);
  }

  @Post('replies/:id/hide')
  async hideReply(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(moderationNoteSchema)) body: { reason?: string },
    @CurrentUser() user?: RequestUser,
    @Ip() ip?: string,
  ) {
    const caller = requireArea(callerOf(user), 'discussions');
    return this.moderation.hideReply(id, caller, ip, body.reason);
  }

  @Post('replies/:id/restore')
  async restoreReply(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
    @Ip() ip?: string,
  ) {
    const caller = requireArea(callerOf(user), 'discussions');
    return this.moderation.restoreReply(id, caller, ip);
  }

  @Get('flagged')
  async flagged(
    @Query(new ZodValidationPipe(paginationSchema)) query: PaginationInput,
    @CurrentUser() user?: RequestUser,
  ) {
    requireArea(callerOf(user), 'discussions');
    return this.moderation.flagged(query.page, query.pageSize);
  }
}
