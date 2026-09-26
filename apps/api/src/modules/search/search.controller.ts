import { Body, Controller, Delete, Get, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  recommendationsQuerySchema,
  searchAnalyticsSchema,
  searchQuerySchema,
  suggestionsQuerySchema,
  type RecommendationsQuery,
  type SearchAnalyticsInput,
  type SearchQuery,
  type SuggestionsQuery,
} from '@apteez/validation';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { OptionalAuth } from '../../common/decorators/auth.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { FeatureFlagsService } from '../../config/feature-flags';
import { AuthRequiredError } from '../auth/auth.errors';
import { SearchService } from './search.service';
import { SimilarProblemService } from './similar-problem.service';

/**
 * Unified lexical discovery. Global throttle applies everywhere; the
 * suggestions endpoint carries a stricter budget against query spam.
 */
@Controller('search')
export class SearchController {
  constructor(
    private readonly search: SearchService,
    private readonly similarService: SimilarProblemService,
    private readonly flags: FeatureFlagsService,
  ) {}

  @OptionalAuth()
  @Get()
  async unified(
    @Query(new ZodValidationPipe(searchQuerySchema)) query: SearchQuery,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.search.search(query, user?.id);
  }

  @OptionalAuth()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Get('suggestions')
  async suggestions(@Query(new ZodValidationPipe(suggestionsQuerySchema)) query: SuggestionsQuery) {
    return this.search.suggestions(query.q);
  }

  @OptionalAuth()
  @Get('filters/problems')
  async problemFilters() {
    return this.search.problemFilters();
  }

  @OptionalAuth()
  @Get('trending')
  async trending() {
    return this.search.trending();
  }

  @Get('recent')
  async recent(@CurrentUser() user?: RequestUser) {
    if (!user) {
      throw new AuthRequiredError('Sign in to view recent searches.');
    }
    return { items: await this.search.recentSearches(user.id) };
  }

  @Delete('recent')
  async clearRecent(@CurrentUser() user?: RequestUser) {
    if (!user) {
      throw new AuthRequiredError('Sign in to clear recent searches.');
    }
    return this.search.clearRecentSearches(user.id);
  }

  /**
   * Similar problems: pgvector retrieval with metadata filtering and a
   * separate rerank stage, falling back to lexical bands. Canonical
   * PUBLISHED problems only — never generated. When AI_SIMILAR_PROBLEMS is
   * off, vector retrieval is skipped server-side (lexical fallback serves).
   */
  // Stricter than the global budget: each call fans out to pgvector retrieval
  // plus hydration, and Similar Problems is a convenience surface, not core.
  @OptionalAuth()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get('similar')
  async similarProblems(
    @Query('problemId', new ParseUUIDPipe({ version: '4' })) problemId: string,
    @Query(new ZodValidationPipe(recommendationsQuerySchema)) query: RecommendationsQuery,
    @CurrentUser() user?: RequestUser,
  ) {
    const ragAllowed = this.flags.isEnabled('AI_SIMILAR_PROBLEMS', { userId: user?.id });
    return {
      items: await this.similarService.findSimilar(problemId, query.limit, { ragAllowed }),
    };
  }

  @OptionalAuth()
  @Post('analytics')
  async analytics(
    @Body(new ZodValidationPipe(searchAnalyticsSchema)) body: SearchAnalyticsInput,
    @CurrentUser() user?: RequestUser,
  ): Promise<{ recorded: boolean }> {
    // Fire-and-forget by design: analytics must never delay a response.
    this.search.logEvent(body, user?.id);
    return { recorded: true };
  }
}
