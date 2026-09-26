import { Body, Controller, Get, Ip, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  adminUserRolesSchema,
  adminUserStatusSchema,
  adminUsersQuerySchema,
  type AdminUserRolesInput,
  type AdminUserStatusInput,
  type AdminUsersQuery,
} from '@apteez/validation';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminUsersService } from './admin-users.service';
import { callerOf, requireArea } from './admin-access';

/** Staff user management. Every mutation is audited and notifies the user. */
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(adminUsersQuerySchema)) query: AdminUsersQuery,
    @CurrentUser() user?: RequestUser,
  ) {
    requireArea(callerOf(user), 'users');
    return this.users.list(query);
  }

  @Get(':id')
  async detail(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: RequestUser,
  ) {
    requireArea(callerOf(user), 'users');
    return this.users.detail(id);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Patch(':id/status')
  async setStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(adminUserStatusSchema)) body: AdminUserStatusInput,
    @CurrentUser() user?: RequestUser,
    @Ip() ip?: string,
  ) {
    const caller = requireArea(callerOf(user), 'users');
    return this.users.setStatus(id, body, caller, ip);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Patch(':id/roles')
  async setRoles(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(adminUserRolesSchema)) body: AdminUserRolesInput,
    @CurrentUser() user?: RequestUser,
    @Ip() ip?: string,
  ) {
    const caller = requireArea(callerOf(user), 'users');
    return this.users.setRoles(id, body.roles, caller, ip);
  }
}
