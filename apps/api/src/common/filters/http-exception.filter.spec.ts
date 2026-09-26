import type { ArgumentsHost } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';
import { AppError } from '../errors/app-error';

function host(): { req: Record<string, unknown>; res: Record<string, unknown> } {
  const res: Record<string, unknown> = {};
  res['status'] = jest.fn().mockReturnValue(res);
  res['json'] = jest.fn().mockReturnValue(res);
  return {
    req: { id: 'req-1', method: 'POST', url: '/api/v1/profile/me/avatar' },
    res,
  };
}

function argumentsHost(req: unknown, res: unknown): ArgumentsHost {
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ArgumentsHost;
}

describe('HttpExceptionFilter', () => {
  const logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() } as never;
  const filter = new HttpExceptionFilter(logger);

  it('maps MulterError (unexpected field, limits) to a safe 400 envelope', () => {
    const { req, res } = host();
    const multerError = Object.assign(new Error('Unexpected field'), {
      name: 'MulterError',
      code: 'LIMIT_UNEXPECTED_FILE',
    });
    filter.catch(multerError, argumentsHost(req, res));
    expect(res['status']).toHaveBeenCalledWith(400);
    const body = (res['json'] as jest.Mock).mock.calls[0]?.[0] as {
      success: boolean;
      error: { statusCode: number; code: string; message: string };
      requestId: string;
    };
    expect(body.success).toBe(false);
    expect(body.error.statusCode).toBe(400);
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.message).not.toContain('Unexpected field');
    expect(body.requestId).toBe('req-1');
  });

  it('passes AppError status and code through untouched', () => {
    const { req, res } = host();
    filter.catch(new AppError('NOT_FOUND', 'Missing thing.', 404), argumentsHost(req, res));
    expect(res['status']).toHaveBeenCalledWith(404);
    const body = (res['json'] as jest.Mock).mock.calls[0]?.[0] as {
      error: { code: string; message: string };
    };
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Missing thing.');
  });
});
