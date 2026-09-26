import { AppError } from '../../common/errors/app-error';

/** 401 — no usable credential was presented. */
export class AuthRequiredError extends AppError {
  constructor(message = 'Authentication is required.') {
    super('AUTH_REQUIRED', message, 401);
    this.name = 'AuthRequiredError';
  }
}

/** 401 — email/password did not match (same shape for unknown accounts). */
export class InvalidCredentialsError extends AppError {
  constructor(message = 'Incorrect email or password.') {
    super('INVALID_CREDENTIALS', message, 401);
    this.name = 'InvalidCredentialsError';
  }
}

/** 403 — credentials were valid but the account is disabled. */
export class AccountDisabledError extends AppError {
  constructor(message = 'This account has been disabled.') {
    super('ACCOUNT_DISABLED', message, 403);
    this.name = 'AccountDisabledError';
  }
}

/** 401 — the session is missing, revoked or expired. */
export class SessionExpiredError extends AppError {
  constructor(message = 'Your session has expired. Please sign in again.') {
    super('SESSION_EXPIRED', message, 401);
    this.name = 'SessionExpiredError';
  }
}

/** 409 — email or username is already registered (generic, no field leak). */
export class AccountExistsError extends AppError {
  constructor(message = 'An account with this email or username already exists.') {
    super('ACCOUNT_EXISTS', message, 409);
    this.name = 'AccountExistsError';
  }
}

/**
 * 400 — OAuth code/state/userinfo exchange failed safely.
 *
 * `reason` is a machine-stable stage code surfaced to the login page as
 * `?oauthError=failed&oauthReason=<reason>` so a failed Google sign-in is
 * self-diagnosing without ever leaking provider internals. Only these
 * allowlisted values may cross the redirect boundary.
 */
export type OAuthFailureReason = 'expired' | 'token' | 'userinfo' | 'provision';

export class InvalidOAuthError extends AppError {
  readonly reason: OAuthFailureReason;

  constructor(
    message = 'Google sign-in failed. Please try again.',
    reason: OAuthFailureReason = 'provision',
  ) {
    super('INVALID_OAUTH', message, 400);
    this.name = 'InvalidOAuthError';
    this.reason = reason;
  }
}

/** 503 — OAuth was called but no provider credentials are configured. */
export class OAuthNotConfiguredError extends AppError {
  constructor(message = 'Google sign-in is not configured on this server.') {
    super('OAUTH_NOT_CONFIGURED', message, 503);
    this.name = 'OAuthNotConfiguredError';
  }
}

/** 503 — email OTP requested but no mail provider is configured. */
export class EmailNotConfiguredError extends AppError {
  constructor(
    message = 'Email verification is not available right now. Please try again later.',
  ) {
    super('EMAIL_NOT_CONFIGURED', message, 503);
    this.name = 'EmailNotConfiguredError';
  }
}

/** 400 — email OTP wrong, expired, or exhausted. Never reveals which. */
export class InvalidEmailOtpError extends AppError {
  constructor(message = 'That code is incorrect or has expired. Request a new one.') {
    super('INVALID_EMAIL_OTP', message, 400);
    this.name = 'InvalidEmailOtpError';
  }
}
