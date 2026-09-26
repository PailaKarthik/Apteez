import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  eventAnswerSchema,
  eventCodeSchema,
  eventCreateSchema,
  eventInviteRespondSchema,
  eventInviteSchema,
  eventLeaderboardQuerySchema,
  eventListQuerySchema,
  eventParticipantsQuerySchema,
  eventReviewSchema,
  eventTransitionSchema,
  eventUpdateSchema,
  type EventAnswerInput,
  type EventCodeInput,
  type EventCreateInput,
  type EventInviteInput,
  type EventInviteRespondInput,
  type EventLeaderboardQuery,
  type EventListQuery,
  type EventParticipantsQuery,
  type EventReviewInput,
  type EventTransitionInput,
  type EventUpdateInput,
} from '@apteez/validation';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { OptionalAuth } from '../../common/decorators/auth.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { FeatureFlagsService } from '../../config/feature-flags';
import { AuthRequiredError } from '../auth/auth.errors';
import { EventsService } from './events.service';

function callerOf(user?: RequestUser) {
  return user ? { id: user.id, roles: user.roles, permissions: user.permissions } : undefined;
}

function requireCaller(user?: RequestUser) {
  if (!user) {
    throw new AuthRequiredError('Sign in to continue.');
  }
  return { id: user.id, roles: user.roles, permissions: user.permissions };
}

/** Public discovery stays anonymous; every mutation requires a session. */
@Controller('events')
export class EventsController {
  constructor(
    private readonly events: EventsService,
    private readonly flags: FeatureFlagsService,
  ) {}

  @OptionalAuth()
  @Get()
  async list(
    @Query(new ZodValidationPipe(eventListQuerySchema)) query: EventListQuery,
    @CurrentUser() user?: RequestUser,
  ) {
    // Kill-switch for anonymous discovery (abuse/spam containment):
    // signed-in callers are unaffected, mutations never were anonymous.
    if (!user) {
      this.flags.requireEnabled('PUBLIC_EVENTS');
    }
    return this.events.list(query, callerOf(user));
  }

  @OptionalAuth()
  @Get(':id')
  async detail(@Param('id') id: string, @CurrentUser() user?: RequestUser) {
    return this.events.detail(id, callerOf(user));
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(eventCreateSchema)) body: EventCreateInput,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.events.create(body, requireCaller(user));
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(eventUpdateSchema)) body: EventUpdateInput,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.events.update(id, body, requireCaller(user));
  }

  @Post(':id/transitions')
  async transition(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(eventTransitionSchema)) body: EventTransitionInput,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.events.transition(id, body, requireCaller(user));
  }

  @Post(':id/publish')
  async publish(@Param('id') id: string, @CurrentUser() user?: RequestUser) {
    const caller = requireCaller(user);
    // Publish prefers REGISTRATION_OPEN so the event is immediately joinable;
    // falls back to PUBLISHED when the registration window is not yet due.
    try {
      return await this.events.transition(id, { to: 'REGISTRATION_OPEN' }, caller);
    } catch {
      return this.events.transition(id, { to: 'PUBLISHED' }, caller);
    }
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @CurrentUser() user?: RequestUser) {
    return this.events.transition(id, { to: 'CANCELLED' }, requireCaller(user));
  }

  @Post(':id/register')
  async register(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(eventCodeSchema)) body: EventCodeInput,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.events.register(id, requireCaller(user), body.code);
  }

  @Delete(':id/register')
  async withdraw(@Param('id') id: string, @CurrentUser() user?: RequestUser) {
    return this.events.withdraw(id, requireCaller(user));
  }

  @Post(':id/join')
  async join(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(eventCodeSchema)) body: EventCodeInput,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.events.join(id, requireCaller(user), body.code);
  }

  @Get(':id/session')
  async session(@Param('id') id: string, @CurrentUser() user?: RequestUser) {
    return this.events.session(id, requireCaller(user));
  }

  @Get(':id/questions')
  async questions(@Param('id') id: string, @CurrentUser() user?: RequestUser) {
    const session = await this.events.session(id, requireCaller(user));
    return { items: session.questions, total: session.totalQuestions };
  }

  @Post(':id/questions/:questionId/answer')
  async answer(
    @Param('id') id: string,
    @Param('questionId', new ParseUUIDPipe({ version: '4' })) questionId: string,
    @Body(new ZodValidationPipe(eventAnswerSchema)) body: EventAnswerInput,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.events.answer(id, questionId, requireCaller(user), body);
  }

  @Post(':id/questions/:questionId/review')
  async review(
    @Param('id') id: string,
    @Param('questionId', new ParseUUIDPipe({ version: '4' })) questionId: string,
    @Body(new ZodValidationPipe(eventReviewSchema)) body: EventReviewInput,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.events.review(id, questionId, requireCaller(user), body);
  }

  @Get(':id/submit-preview')
  async submitPreview(@Param('id') id: string, @CurrentUser() user?: RequestUser) {
    return this.events.submitPreview(id, requireCaller(user));
  }

  // Finalization recomputes ranks and results: own ceiling below the
  // global default against finalize spam.
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post(':id/submit')
  async submit(@Param('id') id: string, @CurrentUser() user?: RequestUser) {
    return this.events.submit(id, requireCaller(user));
  }

  @Get(':id/results')
  async result(@Param('id') id: string, @CurrentUser() user?: RequestUser) {
    return this.events.result(id, requireCaller(user));
  }

  @OptionalAuth()
  @Get(':id/leaderboard')
  async leaderboard(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(eventLeaderboardQuerySchema)) query: EventLeaderboardQuery,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.events.leaderboard(id, query, callerOf(user));
  }

  @Get(':id/participants')
  async participants(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(eventParticipantsQuerySchema)) query: EventParticipantsQuery,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.events.participants(id, query, requireCaller(user));
  }

  @Post(':id/invites')
  async invite(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(eventInviteSchema)) body: EventInviteInput,
    @CurrentUser() user?: RequestUser,
  ): Promise<{ id: string; status: string }> {
    return this.events.invite(id, body, requireCaller(user));
  }

  @Get(':id/invites')
  async invites(@Param('id') id: string, @CurrentUser() user?: RequestUser) {
    return this.events.invites(id, requireCaller(user));
  }

  @Post(':id/invites/respond')
  async respondInvite(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(eventInviteRespondSchema)) body: EventInviteRespondInput,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.events.respondInvite(id, body.accept, requireCaller(user));
  }

  @Get(':id/manage')
  async manage(@Param('id') id: string, @CurrentUser() user?: RequestUser) {
    const [detail, audit] = await Promise.all([
      this.events.detail(id, callerOf(user)),
      this.events.auditLog(id, requireCaller(user)),
    ]);
    return { event: detail, audit: audit.items };
  }
}
