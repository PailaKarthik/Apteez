import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  eventListQuerySchema,
  eventTransitionSchema,
  type EventListQuery,
  type EventTransitionInput,
} from '@apteez/validation';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthRequiredError } from '../auth/auth.errors';
import { EventsService } from './events.service';

/** Admin moderation surface: every user-created event is inspectable here. */
@Controller('admin/events')
export class EventsAdminController {
  constructor(private readonly events: EventsService) {}

  private caller(user?: RequestUser) {
    if (!user) {
      throw new AuthRequiredError('Sign in as an admin.');
    }
    return { id: user.id, roles: user.roles, permissions: user.permissions };
  }

  @Get()
  async list(
    @Query(new ZodValidationPipe(eventListQuerySchema)) query: EventListQuery,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.events.adminList(query, this.caller(user));
  }

  @Get(':id/audit')
  async audit(@Param('id') id: string, @CurrentUser() user?: RequestUser) {
    return this.events.auditLog(id, this.caller(user));
  }

  @Post(':id/transitions')
  async transition(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(eventTransitionSchema)) body: EventTransitionInput,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.events.transition(id, body, this.caller(user));
  }
}
