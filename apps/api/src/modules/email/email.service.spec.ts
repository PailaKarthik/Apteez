import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../../common/logger/app-logger';
import type { Env } from '../../config/env';
import { EmailService } from './email.service';

describe('EmailService', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    jest.restoreAllMocks();
  });

  function makeService(env: Record<string, string | undefined>) {
    const config = { get: (key: string) => env[key] } as unknown as ConfigService<Env, true>;
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as AppLogger;
    return new EmailService(config, logger);
  }

  it('reports unconfigured without a key and skips sends', async () => {
    const service = makeService({ RESEND_API_KEY: '', EMAIL_FROM: 'ApteeZ <a@b.dev>' });
    expect(service.isConfigured()).toBe(false);
    const result = await service.send({ to: 'u@x.com', subject: 's', text: 't', html: '<p>t</p>' });
    expect(result).toEqual({ id: null, skipped: true });
  });

  it('posts to Resend and returns the message id', async () => {
    const service = makeService({
      RESEND_API_KEY: 're_test',
      EMAIL_FROM: 'ApteeZ <verify@x.dev>',
    });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'msg-1' }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const result = await service.send({ to: 'u@x.com', subject: 's', text: 't', html: '<p>t</p>' });
    expect(result).toEqual({ id: 'msg-1', skipped: false });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ from: 'ApteeZ <verify@x.dev>', subject: 's' });
  });

  it('throws EmailSendError when Resend rejects', async () => {
    const service = makeService({ RESEND_API_KEY: 'bad', EMAIL_FROM: 'ApteeZ <a@b.dev>' });
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
    }) as unknown as typeof fetch;
    await expect(
      service.send({ to: 'u@x.com', subject: 's', text: 't', html: '<p>t</p>' }),
    ).rejects.toThrow('Could not send the email');
  });
});
