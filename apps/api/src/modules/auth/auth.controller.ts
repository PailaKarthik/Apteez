import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from '@apteez/validation';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { Env } from '../../config/env';
import { AuthService, type RequestMeta } from './auth.service';
import { GoogleOAuthService } from './google-oauth.service';
import { AuthRequiredError } from './auth.errors';
import { extractSessionToken } from '../../common/guards/session-auth.guard';

function requestMeta(req: Request): RequestMeta {
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    typeof forwarded === 'string'
      ? (forwarded.split(',')[0]?.trim() ?? req.ip)
      : (req.ip ?? undefined);
  return { ip, userAgent: req.headers['user-agent'] };
}

/**
 * Authentication endpoints. All state changes use the session cookie
 * (never localStorage, query strings or response bodies for credentials);
 * every response still follows the shared success/error envelope.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly oauth: GoogleOAuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private cookieOptions(maxAgeSeconds: number): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: maxAgeSeconds * 1000,
    };
  }

  private cookieName(): string {
    return this.config.get('SESSION_COOKIE_NAME', { infer: true });
  }

  @Public()
  @Throttle({ auth: {} })
  @Post('register')
  @HttpCode(201)
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.register(body, requestMeta(req));
    res.cookie(this.cookieName(), session.token, this.cookieOptions(this.sessionTtl()));
    return { user: session.user };
  }

  @Public()
  @Throttle({ auth: {} })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.login(body, requestMeta(req));
    res.cookie(this.cookieName(), session.token, this.cookieOptions(this.sessionTtl()));
    return { user: session.user };
  }

  /**
   * Idempotent by design: missing, expired or forged cookies still return
   * success after clearing the client-side cookie.
   */
  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = extractSessionToken(req, this.cookieName());
    const userId = (req as Request & { user?: RequestUser }).user?.id;
    await this.auth.logout(token, requestMeta(req), userId);
    res.clearCookie(this.cookieName(), this.cookieOptions(0));
    return { loggedOut: true };
  }

  @Get('me')
  async me(@CurrentUser() user: RequestUser | undefined, @Req() req: Request) {
    // The global session guard guarantees a user here; the lookup re-checks
    // freshness (deleted/disabled accounts) on every call.
    if (!user) {
      throw new AuthRequiredError();
    }
    const token = extractSessionToken(req, this.cookieName());
    return this.auth.getMe(user.id, token);
  }

  @Public()
  @Throttle({ auth: {} })
  @Get('google')
  async googleStart(@Query('next') next: string | undefined, @Res() res: Response): Promise<void> {
    const { url } = await this.oauth.begin(next);
    res.redirect(url);
  }

  @Public()
  @Throttle({ auth: {} })
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.oauth.callback(code, state, requestMeta(req));
    res.cookie(this.cookieName(), result.token, this.cookieOptions(this.sessionTtl()));
    const appUrl = this.config.get('APP_URL', { infer: true }).replace(/\/$/, '');
    res.redirect(`${appUrl}${result.next}`);
  }

  private sessionTtl(): number {
    return this.config.get('SESSION_TTL_SECONDS', { infer: true });
  }
}
