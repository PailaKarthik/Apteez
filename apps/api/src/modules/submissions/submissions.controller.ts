import { Controller, Get, Query } from '@nestjs/common';
import { recentSubmissionsQuerySchema, type RecentSubmissionsQuery } from '@apteez/validation';
import type { OffsetPage, RecentSubmissionDto } from '@apteez/types';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { AuthRequiredError } from '../auth/auth.errors';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SubmissionsService } from './submissions.service';

/** GET /api/v1/submissions/recent — the caller's own practice activity. */
@Controller('submissions')
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Get('recent')
  async recent(
    @Query(new ZodValidationPipe(recentSubmissionsQuerySchema)) query: RecentSubmissionsQuery,
    @CurrentUser() user?: RequestUser,
  ): Promise<OffsetPage<RecentSubmissionDto>> {
    if (!user) {
      throw new AuthRequiredError('Sign in to view your practice history.');
    }
    return this.submissions.recent(user.id, query);
  }
}
