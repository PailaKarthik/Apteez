import { describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, getErrorKind } from '../api-client';

describe('getErrorKind', () => {
  it.each([
    [0, 'network'],
    [400, 'validation'],
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [409, 'conflict'],
    [429, 'rate_limit'],
    [500, 'server'],
    [503, 'server'],
    [418, 'unknown'],
  ])('maps status %i to %s', (status, kind) => {
    expect(getErrorKind(status as number)).toBe(kind);
  });

  it('treats VALIDATION_ERROR codes as validation regardless of status', () => {
    expect(getErrorKind(422, 'VALIDATION_ERROR')).toBe('validation');
  });
});

describe('apiFetch', () => {
  it('unwraps the success envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: true, data: { hello: 'world' } }), {
            status: 200,
          }),
      ),
    );
    await expect(apiFetch<{ hello: string }>('/health')).resolves.toEqual({ hello: 'world' });
    vi.unstubAllGlobals();
  });

  it('throws a typed ApiError for API failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: false,
              error: { statusCode: 404, code: 'NOT_FOUND', message: 'Missing' },
              requestId: 'req-123',
            }),
            { status: 404 },
          ),
      ),
    );
    const error = await apiFetch('/missing').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.kind).toBe('not_found');
    expect(apiError.code).toBe('NOT_FOUND');
    expect(apiError.requestId).toBe('req-123');
    vi.unstubAllGlobals();
  });

  it('classifies unreachable APIs as network errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    const error = await apiFetch('/health').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('network');
    vi.unstubAllGlobals();
  });
});
