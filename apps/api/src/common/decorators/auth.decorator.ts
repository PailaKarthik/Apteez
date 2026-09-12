import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { IS_PUBLIC_KEY } from './public.decorator';
import { OptionalAuthGuard } from '../guards/optional-auth.guard';
import { SessionAuthGuard } from '../guards/session-auth.guard';

/**
 * Require an authenticated session. Mostly documentation — the session
 * guard runs globally — but keeps call sites explicit and survives a
 * future switch to opt-in authentication.
 */
export function Auth(): ReturnType<typeof applyDecorators> {
  return applyDecorators(UseGuards(SessionAuthGuard));
}

/**
 * Attach the user when logged in, stay anonymous otherwise. Also marks the
 * route public so the global session guard does not reject anonymous callers.
 */
export function OptionalAuth(): ReturnType<typeof applyDecorators> {
  return applyDecorators(SetMetadata(IS_PUBLIC_KEY, true), UseGuards(OptionalAuthGuard));
}
