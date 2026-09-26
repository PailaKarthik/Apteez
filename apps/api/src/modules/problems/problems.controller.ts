import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { problemListQuerySchema, type ProblemListQuery } from '@apteez/validation';
import type {
  CursorPage,
  ProblemDetailDto,
  ProblemSummaryDto,
  ProblemUserStatsDto,
} from '@apteez/types';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { OptionalAuth } from '../../common/decorators/auth.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ProblemsService } from './problems.service';

/**
 * Public problem read API. Everything here is safe for anonymous callers;
 * signed-in callers additionally receive their solved/favorited state.
 * There are deliberately no mutation endpoints — authoring is an
 * administrative operation.
 */
@Controller('problems')
export class ProblemsController {
  constructor(private readonly problems: ProblemsService) {}

  @OptionalAuth()
  @Get()
  async list(
    @Query(new ZodValidationPipe(problemListQuerySchema)) query: ProblemListQuery,
    @CurrentUser() user?: RequestUser,
  ): Promise<CursorPage<ProblemSummaryDto>> {
    return this.problems.list(query, user?.id);
  }

  /**
   * Total for the current filters (Home library header). Static route — must
   * stay above `:id`, otherwise "count" would hit the UUID pipe and 400.
   */
  @OptionalAuth()
  @Get('count')
  async count(
    @Query(new ZodValidationPipe(problemListQuerySchema)) query: ProblemListQuery,
    @CurrentUser() user?: RequestUser,
  ): Promise<{ total: number }> {
    return this.problems.count(query, user?.id);
  }

  /** Deterministic continuation target for the practice "Next problem" action. */
  @OptionalAuth()
  @Get(':id/next')
  async next(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<{ id: string }> {
    const next = await this.problems.nextProblem(id);
    if (!next) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'No further problem is available.',
      });
    }
    return next;
  }

  @OptionalAuth()
  @Get(':id/stats')
  async stats(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<ProblemUserStatsDto | null> {
    if (!user) {
      return null;
    }
    const stats = await this.problems.userStatsForProblems(user.id, [id]);
    return stats.get(id) ?? null;
  }

  @OptionalAuth()
  @Get(':id')
  async detail(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<ProblemDetailDto> {
    return this.problems.getById(id, user?.id);
  }
}
