import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { type Env, validateEnv } from '../src/config/env';

/**
 * AI application layer + RAG retrieval end-to-end. Boots the real
 * application (requires PostgreSQL and Redis from `pnpm docker:up`).
 *
 * No provider keys are configured in the test environment, so every case
 * below exercises the deterministic fallback paths: the coach degrades to
 * grounded summaries, similar-problems degrades to the lexical band, and
 * nothing is ever generated or hallucinated.
 */
describe('AI + RAG (e2e)', () => {
  let app: NestExpressApplication;
  const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  let n = 0;

  const freshAccount = (overrides: Record<string, string> = {}) => {
    n += 1;
    return {
      displayName: 'E2E Solver',
      username: `e2e_${runId}_${n}`.slice(0, 30),
      email: `e2e-ai-${runId}-${n}@apteez.dev`,
      password: 'correct-horse-battery-staple',
      ...overrides,
    };
  };

  beforeAll(async () => {
    // Same convention as the other suites: relax per-IP throttles so shared
    // Redis counters can't flake the suite; throttling itself is covered by
    // unit tests plus the auth spec's dedicated 429 case.
    const realEnv = validateEnv(process.env);
    const highLimitKeys = new Set<string>(['THROTTLE_LIMIT', 'AUTH_RATE_LIMIT']);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: keyof Env) => (highLimitKeys.has(key) ? 100000 : realEnv[key]),
      } as unknown as ConfigService<Env, true>)
      .compile();
    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  async function loginAgent() {
    const account = freshAccount();
    await request(app.getHttpServer()).post('/api/v1/auth/register').send(account).expect(201);
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .send({ email: account.email, password: account.password })
      .expect(200);
    return agent;
  }

  it('rejects anonymous coach requests with AUTH_REQUIRED', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/ai/coach').expect(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('falls back to a deterministic grounded summary without provider keys', async () => {
    const agent = await loginAgent();
    const response = await agent.post('/api/v1/ai/coach').expect(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.source).toBe('deterministic');
    expect(typeof response.body.data.response.summary).toBe('string');
    expect(response.body.data.response.suggestedProblems).toEqual([]);
  });

  it('returns an empty similar-problems set for unknown problems (never generates)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/search/similar')
      .query({ problemId: '11111111-1111-4111-8111-111111111111', limit: 5 })
      .expect(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.items).toEqual([]);
  });

  it('rejects malformed problem ids on the similar-problems endpoint', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/search/similar')
      .query({ problemId: 'not-a-uuid', limit: 5 })
      .expect(400);
    expect(response.body.success).toBe(false);
  });

  it('gates admin evaluation and usage endpoints behind the analytics area', async () => {
    const agent = await loginAgent();
    const evaluations = await agent.get('/api/v1/admin/ai/evaluations').expect(403);
    expect(evaluations.body.success).toBe(false);
    const usage = await agent.get('/api/v1/admin/ai/usage').expect(403);
    expect(usage.body.success).toBe(false);
  });
});
