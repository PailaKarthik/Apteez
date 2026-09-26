import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import {
  loginSchema,
  registerSchema,
  emailOtpVerifySchema,
  type EmailOtpVerifyInput,
  type LoginInput,
  type RegisterInput,
} from '@apteez/validation';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { Env } from '../../config/env';
import { AuthService, type RequestMeta } from './auth.service';
import { GoogleOAuthService } from './google-oauth.service';
import {
  AuthRequiredError,
  InvalidOAuthError,
  OAuthNotConfiguredError,
} from './auth.errors';
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
    const isProduction = this.config.get('NODE_ENV', { infer: true }) === 'production';
    return {
      httpOnly: true,
      // Production web + API live on different origins (Vercel + Render):
      // SameSite=None + Secure is REQUIRED or the browser stores the session
      // cookie on the API response but never sends it on subsequent
      // cross-site fetch calls — login looks successful then /auth/me 401s
      // ("Checking your session…" then failure). Local dev stays Lax so
      // plain-http localhost works without Secure.
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
      maxAge: maxAgeSeconds * 1000,
    };
  }

  private cookieName(): string {
    return this.config.get('SESSION_COOKIE_NAME', { infer: true });
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('register')
  @HttpCode(201)
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.register(body, requestMeta(req));
    res.cookie(this.cookieName(), session.token, this.cookieOptions(this.sessionTtl()));
    // Best-effort welcome OTP: signup succeeds even when mail is unconfigured.
    const { sent } = await this.auth.sendWelcomeOtp(session.user.id);
    return {
      user: session.user,
      emailVerification: { required: !session.user.emailVerified, sent },
    };
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
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

  /**
   * Email OTP verification (authed caller only — no enumeration oracle).
   * Tight per-route ceilings: codes are cheap to request, expensive to guess.
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('email/verify-request')
  @HttpCode(200)
  async requestEmailOtp(@CurrentUser() user?: RequestUser) {
    if (!user) {
      throw new AuthRequiredError('Sign in to verify your email.');
    }
    return this.auth.requestEmailOtp(user.id);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('email/verify')
  @HttpCode(200)
  async verifyEmailOtp(
    @Body(new ZodValidationPipe(emailOtpVerifySchema)) body: EmailOtpVerifyInput,
    @CurrentUser() user?: RequestUser,
  ) {
    if (!user) {
      throw new AuthRequiredError('Sign in to verify your email.');
    }
    // Return the fresh profile so clients flip to verified without refetch.
    return this.auth.verifyEmailOtp(user.id, body.code);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('google')
  async googleStart(@Query('next') next: string | undefined, @Res() res: Response): Promise<void> {
    try {
      const { url } = await this.oauth.begin(next);
      res.redirect(url);
    } catch {
      // Browser-navigated route: never leak a JSON 500 — send the caller
      // back to login with a code the form renders inline.
      res.redirect(`${this.appUrl()}/login?oauthError=unavailable`);
    }
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const result = await this.oauth.callback(code, state, requestMeta(req));
      res.cookie(this.cookieName(), result.token, this.cookieOptions(this.sessionTtl()));
      res.redirect(`${this.appUrl()}${result.next}`);
    } catch (error) {
      // Browser-navigated route: NEVER return a JSON 500 page. Every failure
      // lands back on login with an inline message; InvalidOAuthError carries
      // a stage code (expired|token|userinfo|provision) so the failure is
      // self-diagnosing. Details stay server-side in logs.
      if (error instanceof OAuthNotConfiguredError) {
        res.redirect(`${this.appUrl()}/login?oauthError=unavailable`);
        return;
      }
      if (error instanceof InvalidOAuthError) {
        res.redirect(`${this.appUrl()}/login?oauthError=failed&oauthReason=${error.reason}`);
        return;
      }
      res.redirect(`${this.appUrl()}/login?oauthError=failed`);
    }
  }

  private appUrl(): string {
    return this.config.get('APP_URL', { infer: true }).replace(/\/$/, '');
  }

  private sessionTtl(): number {
    return this.config.get('SESSION_TTL_SECONDS', { infer: true });
  }
}
