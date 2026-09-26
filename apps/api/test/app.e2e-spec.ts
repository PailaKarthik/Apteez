import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';

/**
 * End-to-end structure. Boots the real application (requires PostgreSQL and
 * Redis from `pnpm docker:up`) and asserts the shared response/error
 * contract over HTTP.
 */
describe('API (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/v1/health returns the envelope with dependency checks', async () => {
    // Readiness is eventually consistent: the first check may race the
    // client's initial connection (and trigger its self-healing redial),
    // so poll briefly instead of asserting a single instant.
    let response: request.Response | null = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const candidate = await request(app.getHttpServer()).get('/api/v1/health');
      if (candidate.status === 200) {
        response = candidate;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    expect(response?.status).toBe(200);
    expect(response?.body.success).toBe(true);
    expect(response?.body.data.status).toBe('ok');
    expect(response?.body.data.checks.database.status).toBe('up');
    expect(response?.body.data.checks.redis.status).toBe('up');
    expect(response?.headers['x-request-id']).toBeDefined();
  });

  it('unknown routes use the shared error envelope', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/nope').expect(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.requestId).toBeDefined();
  });
});
