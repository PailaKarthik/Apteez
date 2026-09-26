import { OriginCheckMiddleware } from './origin-check.middleware';

function setup() {
  const config = {
    get: (key: string) =>
      ({
        APP_URL: 'http://localhost:3000',
        CORS_ORIGINS: 'http://localhost:3000',
      })[key],
  } as never;
  return new OriginCheckMiddleware(config);
}

function req(method: string, headers: Record<string, string>) {
  const next = jest.fn();
  return { req: { method, headers } as never, next };
}

describe('OriginCheckMiddleware', () => {
  it('lets reads through without any headers', () => {
    const middleware = setup();
    const { req: request, next } = req('GET', {});
    expect(() => middleware.use(request, {} as never, next)).not.toThrow();
    expect(next).toHaveBeenCalled();
  });

  it('lets headerless mutation clients through', () => {
    const middleware = setup();
    const { req: request, next } = req('POST', {});
    expect(() => middleware.use(request, {} as never, next)).not.toThrow();
    expect(next).toHaveBeenCalled();
  });

  it('accepts the configured localhost origin', () => {
    const middleware = setup();
    const { req: request, next } = req('POST', { origin: 'http://localhost:3000' });
    expect(() => middleware.use(request, {} as never, next)).not.toThrow();
    expect(next).toHaveBeenCalled();
  });

  it('treats 127.0.0.1 and [::1] tabs as the same localhost app', () => {
    const middleware = setup();
    for (const origin of ['http://127.0.0.1:3000', 'http://[::1]:3000']) {
      const { req: request, next } = req('POST', { origin });
      expect(() => middleware.use(request, {} as never, next)).not.toThrow();
      expect(next).toHaveBeenCalled();
    }
  });

  it('still refuses genuinely foreign origins, wrong ports and garbage', () => {
    const middleware = setup();
    for (const origin of [
      'http://evil.com',
      'http://localhost:3001',
      'https://localhost:3000',
      'not-a-url',
    ]) {
      const { req: request, next } = req('POST', { origin });
      expect(() => middleware.use(request, {} as never, next)).toThrow(
        expect.objectContaining({ status: 403 }),
      );
      expect(next).not.toHaveBeenCalled();
    }
  });
});
