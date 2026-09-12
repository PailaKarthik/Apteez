import { Global, Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleOAuthService } from './google-oauth.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

/**
 * Authentication workflows (email/password + Google OAuth + sessions).
 * User persistence stays in UsersModule; password mathematics in
 * PasswordService. Registered globally so route-scoped guards
 * (SessionAuthGuard, OptionalAuthGuard) resolve in any feature module.
 */
@Global()
@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, GoogleOAuthService, PasswordService, SessionService],
  exports: [PasswordService, SessionService],
})
export class AuthModule {}
