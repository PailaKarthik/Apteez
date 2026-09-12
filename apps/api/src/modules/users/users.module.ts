import { Global, Module } from '@nestjs/common';
import { UsersService } from './users.service';

/**
 * User data management. Auth workflows live in AuthModule. Global so
 * route-scoped auth guards can resolve UsersService anywhere.
 */
@Global()
@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
