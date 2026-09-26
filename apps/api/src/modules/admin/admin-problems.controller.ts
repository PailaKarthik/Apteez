import {
  Body,
  Controller,
  Delete,
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
  adminProblemCreateSchema,
  adminProblemPatchSchema,
  adminProblemsQuerySchema,
  type AdminProblemCreateInput,
  type AdminProblemPatchInput,
  type AdminProblemsQuery,
} from '@apteez/validation';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminProblemsService } from './admin-problems.service';
import { callerOf, requireArea } from './admin-access';

/** Canonical problem moderation. Hard delete is allowed only when unreferenced. */
@Controller('admin/problems')
export class AdminProblemsController {
  constructor(private readonly problems: AdminProblemsService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(adminProblemsQuerySchema)) query: AdminProblemsQuery,
    @CurrentUser() user?: RequestUser,
  ) {
    requireArea(callerOf(user), 'content');
    return this.problems.list(query);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post()
  async create(
    @Body(new ZodValidationPipe(adminProblemCreateSchema)) body: AdminProblemCreateInput,
    @CurrentUser() user?: RequestUser,
    @Ip() ip?: string,
  ) {
    const caller = requireArea(callerOf(user), 'content');
    return this.problems.create(body, caller, ip);
  }

  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(adminProblemPatchSchema)) body: AdminProblemPatchInput,
    @CurrentUser() user?: RequestUser,
    @Ip() ip?: string,
  ) {
    const caller = requireArea(callerOf(user), 'content');
    return this.problems.update(id, body, caller, ip);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post(':id/publish')
  async publish(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
    @Ip() ip?: string,
  ) {
    const caller = requireArea(callerOf(user), 'content');
    return this.problems.transition(id, 'PUBLISHED', caller, ip);
  }

  @Post(':id/archive')
  async archive(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
    @Ip() ip?: string,
  ) {
    const caller = requireArea(callerOf(user), 'content');
    return this.problems.transition(id, 'ARCHIVED', caller, ip);
  }

  @Post(':id/restore')
  async restore(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
    @Ip() ip?: string,
  ) {
    const caller = requireArea(callerOf(user), 'content');
    return this.problems.transition(id, 'PUBLISHED', caller, ip);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Delete(':id')
  async destroy(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
    @Ip() ip?: string,
  ) {
    const caller = requireArea(callerOf(user), 'content');
    return this.problems.destroy(id, caller, ip);
  }
}
