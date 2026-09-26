import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  contributionQuestionSchema,
  paginationSchema,
  type ContributionQuestionInput,
  type PaginationInput,
} from '@apteez/validation';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthRequiredError } from '../auth/auth.errors';
import { ContributionService } from './contribution.service';

function requireCaller(user?: RequestUser): string {
  if (!user) {
    throw new AuthRequiredError('Sign in to contribute questions.');
  }
  return user.id;
}

/** Contributor-facing endpoints. Review tooling lives in AdminModule. */
@Controller('contributions')
export class ContributionController {
  constructor(private readonly contributions: ContributionService) {}

  @Post()
  async submit(
    @Body(new ZodValidationPipe(contributionQuestionSchema)) body: ContributionQuestionInput,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.contributions.submit(body, requireCaller(user));
  }

  @Get('mine')
  async mine(
    @Query(new ZodValidationPipe(paginationSchema)) query: PaginationInput,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.contributions.mine(requireCaller(user), query.page, query.pageSize);
  }

  @Get(':id')
  async detail(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.contributions.detailForUser(id, requireCaller(user));
  }

  /** Revise your own PENDING contribution (e.g. after reviewer feedback). */
  @Patch(':id')
  async resubmit(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(contributionQuestionSchema)) body: ContributionQuestionInput,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.contributions.resubmit(id, body, requireCaller(user));
  }
}
