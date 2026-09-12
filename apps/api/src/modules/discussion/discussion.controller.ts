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
import {
  discussionCreateReplySchema,
  discussionCreateThreadSchema,
  discussionListQuerySchema,
  discussionReactionSchema,
  discussionRepliesQuerySchema,
  discussionReportSchema,
  discussionUpdateThreadSchema,
  type DiscussionCreateReplyInput,
  type DiscussionCreateThreadInput,
  type DiscussionListQuery,
  type DiscussionReactionInput,
  type DiscussionRepliesQuery,
  type DiscussionReportInput,
  type DiscussionUpdateThreadInput,
} from '@apteez/validation';
import type {
  DiscussionReactionResultDto,
  DiscussionReplyDto,
  DiscussionThreadDetailDto,
  DiscussionThreadSummaryDto,
  PaginatedData,
} from '@apteez/types';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { OptionalAuth } from '../../common/decorators/auth.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthRequiredError } from '../auth/auth.errors';
import { DiscussionService } from './discussion.service';

/**
 * Community discussions. Discovery and thread reads are public; creating,
 * editing, reacting, reporting and moderation all require a session. The
 * server owns every counter, the accepted-solution flag and soft deletion.
 */
@Controller('discussions')
export class DiscussionController {
  constructor(private readonly discussions: DiscussionService) {}

  @OptionalAuth()
  @Get()
  async list(
    @Query(new ZodValidationPipe(discussionListQuerySchema)) query: DiscussionListQuery,
    @CurrentUser() user?: RequestUser,
  ): Promise<PaginatedData<DiscussionThreadSummaryDto>> {
    return this.discussions.list(query, user?.id);
  }

  @OptionalAuth()
  @Get(':id')
  async detail(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query(new ZodValidationPipe(discussionRepliesQuerySchema)) query: DiscussionRepliesQuery,
    @CurrentUser() user?: RequestUser,
  ): Promise<DiscussionThreadDetailDto> {
    return this.discussions.detail(id, query, user);
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(discussionCreateThreadSchema)) body: DiscussionCreateThreadInput,
    @CurrentUser() user?: RequestUser,
  ): Promise<DiscussionThreadDetailDto> {
    if (!user) {
      throw new AuthRequiredError('Sign in to start a discussion.');
    }
    return this.discussions.createThread(body, user.id);
  }

  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(discussionUpdateThreadSchema)) body: DiscussionUpdateThreadInput,
    @CurrentUser() user?: RequestUser,
  ): Promise<DiscussionThreadDetailDto> {
    if (!user) {
      throw new AuthRequiredError('Sign in to edit this discussion.');
    }
    return this.discussions.updateThread(id, body, user);
  }

  @Delete(':id')
  async remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<{ deleted: boolean }> {
    if (!user) {
      throw new AuthRequiredError('Sign in to delete this discussion.');
    }
    await this.discussions.deleteThread(id, user);
    return { deleted: true };
  }

  @Post(':id/pin')
  async pin(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<{ pinned: boolean }> {
    if (!user) {
      throw new AuthRequiredError('Sign in to pin discussions.');
    }
    await this.discussions.setPinned(id, true, user);
    return { pinned: true };
  }

  @Delete(':id/pin')
  async unpin(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<{ pinned: boolean }> {
    if (!user) {
      throw new AuthRequiredError('Sign in to unpin discussions.');
    }
    await this.discussions.setPinned(id, false, user);
    return { pinned: false };
  }

  @Post(':id/lock')
  async lock(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<{ locked: boolean }> {
    if (!user) {
      throw new AuthRequiredError('Sign in to lock discussions.');
    }
    await this.discussions.setLocked(id, true, user);
    return { locked: true };
  }

  @Delete(':id/lock')
  async unlock(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<{ locked: boolean }> {
    if (!user) {
      throw new AuthRequiredError('Sign in to unlock discussions.');
    }
    await this.discussions.setLocked(id, false, user);
    return { locked: false };
  }

  @Post(':id/reactions')
  async react(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(discussionReactionSchema)) body: DiscussionReactionInput,
    @CurrentUser() user?: RequestUser,
  ): Promise<DiscussionReactionResultDto> {
    if (!user) {
      throw new AuthRequiredError('Sign in to react to discussions.');
    }
    return this.discussions.reactToPost(id, body.type, user.id);
  }

  @Delete(':id/reactions')
  async clearReaction(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<DiscussionReactionResultDto> {
    if (!user) {
      throw new AuthRequiredError('Sign in to react to discussions.');
    }
    return this.discussions.reactToPost(id, null, user.id);
  }

  @Post(':id/report')
  async report(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(discussionReportSchema)) body: DiscussionReportInput,
    @CurrentUser() user?: RequestUser,
  ): Promise<{ reported: boolean }> {
    if (!user) {
      throw new AuthRequiredError('Sign in to report content.');
    }
    return this.discussions.report(body, { postId: id }, user.id);
  }

  @Post(':id/replies')
  async reply(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(discussionCreateReplySchema)) body: DiscussionCreateReplyInput,
    @CurrentUser() user?: RequestUser,
  ): Promise<DiscussionReplyDto> {
    if (!user) {
      throw new AuthRequiredError('Sign in to reply to discussions.');
    }
    return this.discussions.createReply(id, body, user.id);
  }

  @Patch(':id/replies/:replyId')
  async updateReply(
    @Param('id', new ParseUUIDPipe({ version: '4' })) _id: string,
    @Param('replyId', new ParseUUIDPipe({ version: '4' })) replyId: string,
    @Body(new ZodValidationPipe(discussionCreateReplySchema)) body: DiscussionCreateReplyInput,
    @CurrentUser() user?: RequestUser,
  ): Promise<DiscussionReplyDto> {
    if (!user) {
      throw new AuthRequiredError('Sign in to edit this reply.');
    }
    return this.discussions.updateReply(replyId, body.body, user);
  }

  @Delete(':id/replies/:replyId')
  async deleteReply(
    @Param('id', new ParseUUIDPipe({ version: '4' })) _id: string,
    @Param('replyId', new ParseUUIDPipe({ version: '4' })) replyId: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<{ deleted: boolean }> {
    if (!user) {
      throw new AuthRequiredError('Sign in to delete this reply.');
    }
    await this.discussions.deleteReply(replyId, user);
    return { deleted: true };
  }

  @Post(':id/replies/:replyId/accept')
  async acceptReply(
    @Param('id', new ParseUUIDPipe({ version: '4' })) _id: string,
    @Param('replyId', new ParseUUIDPipe({ version: '4' })) replyId: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<DiscussionReplyDto> {
    if (!user) {
      throw new AuthRequiredError('Sign in to accept a solution.');
    }
    return this.discussions.acceptReply(replyId, user);
  }

  @Post(':id/replies/:replyId/reactions')
  async reactToReply(
    @Param('id', new ParseUUIDPipe({ version: '4' })) _id: string,
    @Param('replyId', new ParseUUIDPipe({ version: '4' })) replyId: string,
    @Body(new ZodValidationPipe(discussionReactionSchema)) body: DiscussionReactionInput,
    @CurrentUser() user?: RequestUser,
  ): Promise<DiscussionReactionResultDto> {
    if (!user) {
      throw new AuthRequiredError('Sign in to react to replies.');
    }
    return this.discussions.reactToReply(replyId, body.type, user.id);
  }

  @Post(':id/replies/:replyId/report')
  async reportReply(
    @Param('id', new ParseUUIDPipe({ version: '4' })) _id: string,
    @Param('replyId', new ParseUUIDPipe({ version: '4' })) replyId: string,
    @Body(new ZodValidationPipe(discussionReportSchema)) body: DiscussionReportInput,
    @CurrentUser() user?: RequestUser,
  ): Promise<{ reported: boolean }> {
    if (!user) {
      throw new AuthRequiredError('Sign in to report content.');
    }
    return this.discussions.report(body, { replyId }, user.id);
  }
}