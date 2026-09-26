import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { notificationListQuerySchema, type NotificationListQuery } from '@apteez/validation';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { AuthRequiredError } from '../auth/auth.errors';
import { NotificationService } from './notification.service';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(notificationListQuerySchema)) query: NotificationListQuery,
    @CurrentUser() user?: RequestUser,
  ) {
    if (!user) {
      throw new AuthRequiredError('Sign in to view notifications.');
    }
    return this.notifications.list(user.id, query);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user?: RequestUser) {
    if (!user) {
      throw new AuthRequiredError('Sign in to view notifications.');
    }
    return this.notifications.unreadCount(user.id);
  }

  @Patch(':id/read')
  async markRead(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ) {
    if (!user) {
      throw new AuthRequiredError('Sign in to manage notifications.');
    }
    return this.notifications.markRead(user.id, id);
  }

  @Post('read-all')
  async markAllRead(@CurrentUser() user?: RequestUser) {
    if (!user) {
      throw new AuthRequiredError('Sign in to manage notifications.');
    }
    return this.notifications.markAllRead(user.id);
  }
}
