import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../../common/logger/app-logger';
import type { Env } from '../../config/env';
import { RedisService } from '../../redis/redis.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { EmailService } from '../email/email.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { EmailNotConfiguredError, InvalidEmailOtpError } from './auth.errors';

describe('AuthService email OTP', () => {
  function setup(mailConfigured: boolean) {
    const store = new Map<string, { value: string; ttl?: number }>();
    const users = {
      findById: jest.fn(async () => ({
        id: 'u1',
        email: 'u@x.com',
        displayName: 'U X',
        emailVerified: null,
      })),
      markEmailVerified: jest.fn(async () => undefined),
      findAuthProfile: jest.fn(async () => ({ id: 'u1', email: 'u@x.com' })),
    } as unknown as UsersService & {
      findById: jest.Mock;
      markEmailVerified: jest.Mock;
      findAuthProfile: jest.Mock;
    };
    const redis = {
      get: jest.fn(async (key: string) => store.get(key)?.value ?? null),
      set: jest.fn(async (key: string, value: string, ttl?: number) => {
        store.set(key, { value, ttl });
      }),
      del: jest.fn(async (key: string) => {
        store.delete(key);
      }),
      ttl: jest.fn(async (key: string) => store.get(key)?.ttl ?? 600),
    } as unknown as RedisService & { get: jest.Mock; set: jest.Mock };
    const email = {
      isConfigured: () => mailConfigured,
      sendVerificationCode: jest.fn(async () => undefined),
    } as unknown as EmailService & { sendVerificationCode: jest.Mock };
    const config = { get: jest.fn() } as unknown as ConfigService<Env, true>;
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as AppLogger;
    const service = new AuthService(
      users,
      {} as PasswordService,
      {} as SessionService,
      config,
      logger,
      {} as AnalyticsService,
      redis,
      email,
    );
    return { service, users, redis, email, store };
  }

  it('sends a hashed code and verifies it exactly once', async () => {
    const { service, email, store } = setup(true);
    const requested = await service.requestEmailOtp('u1');
    expect(requested).toEqual({ sent: true, verified: false });
    expect(email.sendVerificationCode).toHaveBeenCalledTimes(1);
    const [to, , code] = (email.sendVerificationCode as jest.Mock).mock.calls[0] as [
      string,
      string,
      string,
    ];
    expect(to).toBe('u@x.com');
    expect(code).toMatch(/^\d{6}$/);
    // Stored hashed, never plaintext.
    const raw = [...store.values()][0].value;
    expect(raw).not.toContain(code);
    expect(JSON.parse(raw)).toMatchObject({
      hash: createHash('sha256').update(code, 'utf8').digest('hex'),
      attempts: 0,
    });

    await service.verifyEmailOtp('u1', code);
    // Single-use: second attempt expires.
    await expect(service.verifyEmailOtp('u1', code)).rejects.toBeInstanceOf(
      InvalidEmailOtpError,
    );
  });

  it('counts wrong attempts and burns the code after five', async () => {
    const { service } = setup(true);
    await service.requestEmailOtp('u1');
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(service.verifyEmailOtp('u1', '000000')).rejects.toThrow(/attempts? left/);
    }
    await expect(service.verifyEmailOtp('u1', '000000')).rejects.toThrow(/new one/);
    await expect(service.verifyEmailOtp('u1', '000000')).rejects.toThrow(/Too many wrong/);
  });

  it('skips sending for already-verified accounts', async () => {
    const { service, users, email } = setup(true);
    (users.findById as jest.Mock).mockResolvedValue({
      id: 'u1',
      email: 'u@x.com',
      displayName: 'U X',
      emailVerified: new Date(),
    });
    await expect(service.requestEmailOtp('u1')).resolves.toEqual({
      sent: false,
      verified: true,
    });
    expect(email.sendVerificationCode).not.toHaveBeenCalled();
  });

  it('fails loudly when the mailer is unconfigured, but welcome OTP never throws', async () => {
    const { service } = setup(false);
    await expect(service.requestEmailOtp('u1')).rejects.toBeInstanceOf(EmailNotConfiguredError);
    await expect(service.sendWelcomeOtp('u1')).resolves.toEqual({ sent: false });
  });
});
