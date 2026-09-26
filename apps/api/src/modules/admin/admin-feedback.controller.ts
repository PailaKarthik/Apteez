import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import {
  adminFeedbackUpdateSchema,
  feedbackQuerySchema,
  type AdminFeedbackUpdateInput,
  type FeedbackQuery,
} from '@apteez/validation';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { FeedbackService } from '../feedback/feedback.service';
import { AdminAuditService } from './admin-audit.service';
import { callerOf, requireArea } from './admin-access';

/**
 * Staff feedback triage. Status/priority transitions are audited like every
 * other moderation action; feedback rows are never deleted (DISMISSED is the
 * terminal state for noise).
 */
@Controller('admin/feedback')
export class AdminFeedbackController {
  constructor(
    private readonly feedback: FeedbackService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(feedbackQuerySchema)) query: FeedbackQuery,
    @CurrentUser() user?: RequestUser,
  ) {
    requireArea(callerOf(user), 'analytics');
    return this.feedback.list(query);
  }

  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(adminFeedbackUpdateSchema)) body: AdminFeedbackUpdateInput,
    @CurrentUser() user?: RequestUser,
  ) {
    const caller = requireArea(callerOf(user), 'analytics');
    const { dto, changed } = await this.feedback.update(id, body);
    if (changed) {
      await this.audit.log({
        actorUserId: caller.id,
        action: 'feedback.triage',
        targetType: 'FEEDBACK',
        targetId: id,
        previousValue: null,
        newValue: { status: dto.status, priority: dto.priority },
        reason: null,
      });
    }
    return dto;
  }
}
