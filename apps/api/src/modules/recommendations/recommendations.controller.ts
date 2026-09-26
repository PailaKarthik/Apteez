import { Controller, Get, Query } from '@nestjs/common';
import { recommendationsQuerySchema, type RecommendationsQuery } from '@apteez/validation';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { OptionalAuth } from '../../common/decorators/auth.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PersonalizationService } from './personalization.service';

function callerOf(
  user?: RequestUser,
): { id: string; roles: string[]; permissions: string[] } | undefined {
  return user ? { id: user.id, roles: user.roles, permissions: user.permissions } : undefined;
}

/**
 * Deterministic recommendation endpoints. Anonymous callers receive
 * explicitly labeled cold-start discovery; authenticated callers receive
 * performance-driven picks with reasons. No LLM anywhere on this path.
 */
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly personalization: PersonalizationService) {}

  @OptionalAuth()
  @Get('problems')
  async problems(
    @Query(new ZodValidationPipe(recommendationsQuerySchema)) query: RecommendationsQuery,
    @CurrentUser() user?: RequestUser,
  ) {
    return { items: await this.personalization.recommendedProblems(user?.id, query.limit) };
  }

  @OptionalAuth()
  @Get('topics')
  async topics(
    @Query(new ZodValidationPipe(recommendationsQuerySchema)) query: RecommendationsQuery,
    @CurrentUser() user?: RequestUser,
  ) {
    return { items: await this.personalization.recommendedTopics(user?.id, query.limit) };
  }

  @OptionalAuth()
  @Get('learning')
  async learning(
    @Query(new ZodValidationPipe(recommendationsQuerySchema)) query: RecommendationsQuery,
    @CurrentUser() user?: RequestUser,
  ) {
    return { items: await this.personalization.continueLearning(user?.id, query.limit) };
  }

  @OptionalAuth()
  @Get('contests')
  async contests(
    @Query(new ZodValidationPipe(recommendationsQuerySchema)) query: RecommendationsQuery,
    @CurrentUser() user?: RequestUser,
  ) {
    return { items: await this.personalization.recommendedContests(user?.id, query.limit) };
  }

  @OptionalAuth()
  @Get('events')
  async events(
    @Query(new ZodValidationPipe(recommendationsQuerySchema)) query: RecommendationsQuery,
    @CurrentUser() user?: RequestUser,
  ) {
    return {
      items: await this.personalization.recommendedEvents(callerOf(user), query.limit),
    };
  }

  @OptionalAuth()
  @Get('home')
  async home(@CurrentUser() user?: RequestUser) {
    return this.personalization.home(user?.id, callerOf(user));
  }
}
