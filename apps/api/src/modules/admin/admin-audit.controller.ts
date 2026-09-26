import { Controller, Get, Query } from '@nestjs/common';
import { auditLogsQuerySchema, type AuditLogsQuery } from '@apteez/validation';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminAuditService } from './admin-audit.service';
import { callerOf, requireArea } from './admin-access';

/** Append-only audit reads. No update or delete route exists by design. */
@Controller('admin/audit-logs')
export class AdminAuditController {
  constructor(private readonly audit: AdminAuditService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(auditLogsQuerySchema)) query: AuditLogsQuery,
    @CurrentUser() user?: RequestUser,
  ) {
    requireArea(callerOf(user), 'analytics');
    return this.audit.list(query);
  }
}
