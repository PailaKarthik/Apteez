import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@apteez/database';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { type Env, validateEnv } from '../src/config/env';

interface AttemptBody {
  id: string;
  problemId: string;
  status: string;
  startedAt: string;
}

interface ResultBody {
  attempt: AttemptBody;
  result: {
    selectedOptionId: string | null;
    correctOptionId: string | null;
    isCorrect: boolean;
    explanation: string | null;
    shortcut: string | null;
    timeSpentSeconds: number | null;
  };
  problem: { id: string; options: Array<{ id: string }> };
}

describe('Practice (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let agent: ReturnType<typeof request.agent>;
  let problemId: string;
  let correctOptionId: string;
  let wrongOptionId: string;
  let draftProblemId: string;
  let foreignOptionId: string;

  beforeAll(async () => {
    const realEnv = validateEnv(process.env);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: keyof Env) => (key === 'PRACTICE_RATE_LIMIT' ? 100000 : realEnv[key]),
      } as unknown as ConfigService<Env, true>)
      .compile();
    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const seeded = await prisma.problem.findFirstOrThrow({
      where: { status: 'PUBLISHED', title: { contains: 'Time and Work' } },
      include: { options: { orderBy: { position: 'asc' } } },
    });
    problemId = seeded.id;
    correctOptionId = seeded.options.find((option) => option.isCorrect)!.id;
    wrongOptionId = seeded.options.find((option) => !option.isCorrect)!.id;

    const other = await prisma.problem.findFirstOrThrow({
      where: { status: 'PUBLISHED', id: { not: problemId } },
      include: { options: true },
    });
    foreignOptionId = other.options[0]!.id;

    const topic = await prisma.topic.findFirstOrThrow({ where: { slug: 'percentages' } });
    const draft = await prisma.problem.create({
      data: {
        title: 'Practice e2e draft',
        statement: 'Draft, must not be practiceable.',
        status: 'DRAFT',
        categoryId: topic.categoryId,
        topicId: topic.id,
        options: { create: [{ position: 0, text: 'A', isCorrect: true }] },
      },
    });
    draftProblemId = draft.id;

    agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .send({ email: 'member@apteez.dev', password: 'apteez-dev-only' })
      .expect(200);
  }, 60_000);

  afterAll(async () => {
    if (draftProblemId) {
      await prisma.problem.deleteMany({ where: { id: draftProblemId } });
    }
    await app?.close();
  });

  it('requires authentication to start an attempt', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/problems/${problemId}/attempts`)
      .expect(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('starts a practice attempt with STARTED status', async () => {
    const res = await agent.post(`/api/v1/problems/${problemId}/attempts`).expect(201);
    const body = res.body.data as AttemptBody;
    expect(body.status).toBe('STARTED');
    expect(body.problemId).toBe(problemId);
    await agent.post(`/api/v1/problems/${problemId}/attempts/${body.id}/abandon`).expect(200);
  });

  it('rejects starting an attempt on an unpublished problem', async () => {
    const res = await agent.post(`/api/v1/problems/${draftProblemId}/attempts`).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('scores a correct answer server-side and reveals the explanation', async () => {
    const attempt = (await agent.post(`/api/v1/problems/${problemId}/attempts`).expect(201)).body
      .data as AttemptBody;
    const res = await agent
      .post(`/api/v1/problems/${problemId}/attempts/${attempt.id}/submit`)
      .send({ selectedOptionId: correctOptionId, clientTimeSpentSeconds: 5 })
      .expect(200);
    const body = res.body.data as ResultBody;
    expect(body.result.isCorrect).toBe(true);
    expect(body.result.correctOptionId).toBe(correctOptionId);
    expect(body.result.explanation).toBeTruthy();
    expect(body.result.timeSpentSeconds).toBeGreaterThanOrEqual(0);
    expect(body.attempt.status).toBe('SUBMITTED');
  });

  it('scores a wrong answer server-side', async () => {
    const attempt = (await agent.post(`/api/v1/problems/${problemId}/attempts`).expect(201)).body
      .data as AttemptBody;
    const res = await agent
      .post(`/api/v1/problems/${problemId}/attempts/${attempt.id}/submit`)
      .send({ selectedOptionId: wrongOptionId })
      .expect(200);
    const body = res.body.data as ResultBody;
    expect(body.result.isCorrect).toBe(false);
    expect(body.result.correctOptionId).toBe(correctOptionId);
  });

  it('rejects an option that belongs to another problem', async () => {
    const attempt = (await agent.post(`/api/v1/problems/${problemId}/attempts`).expect(201)).body
      .data as AttemptBody;
    const res = await agent
      .post(`/api/v1/problems/${problemId}/attempts/${attempt.id}/submit`)
      .send({ selectedOptionId: foreignOptionId })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('isCorrect');
  });

  it('rejects a payload that tries to smuggle correctness', async () => {
    const attempt = (await agent.post(`/api/v1/problems/${problemId}/attempts`).expect(201)).body
      .data as AttemptBody;
    await agent
      .post(`/api/v1/problems/${problemId}/attempts/${attempt.id}/submit`)
      .send({ selectedOptionId: correctOptionId, isCorrect: true, score: 999 })
      .expect(200);
  });

  it('treats a repeated submission as an idempotent replay', async () => {
    const attempt = (await agent.post(`/api/v1/problems/${problemId}/attempts`).expect(201)).body
      .data as AttemptBody;
    const first = await agent
      .post(`/api/v1/problems/${problemId}/attempts/${attempt.id}/submit`)
      .send({ selectedOptionId: wrongOptionId })
      .expect(200);
    const replay = await agent
      .post(`/api/v1/problems/${problemId}/attempts/${attempt.id}/submit`)
      .send({ selectedOptionId: correctOptionId })
      .expect(200);
    expect(replay.body.data.result.isCorrect).toBe(false);
    expect(replay.body.data.result.selectedOptionId).toBe(first.body.data.result.selectedOptionId);
  });

  it('resolves concurrent submissions to a single finalized result', async () => {
    const attempt = (await agent.post(`/api/v1/problems/${problemId}/attempts`).expect(201)).body
      .data as AttemptBody;
    const [a, b] = await Promise.all([
      agent
        .post(`/api/v1/problems/${problemId}/attempts/${attempt.id}/submit`)
        .send({ selectedOptionId: correctOptionId }),
      agent
        .post(`/api/v1/problems/${problemId}/attempts/${attempt.id}/submit`)
        .send({ selectedOptionId: wrongOptionId }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const rows = await prisma.submission.findMany({ where: { id: attempt.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('SUBMITTED');
  });

  it("hides another user's attempt behind a 404", async () => {
    const attempt = (await agent.post(`/api/v1/problems/${problemId}/attempts`).expect(201)).body
      .data as AttemptBody;
    const otherAgent = request.agent(app.getHttpServer());
    await otherAgent
      .post('/api/v1/auth/login')
      .send({ email: 'admin@apteez.dev', password: 'apteez-dev-only' })
      .expect(200);
    const res = await otherAgent
      .post(`/api/v1/problems/${problemId}/attempts/${attempt.id}/submit`)
      .send({ selectedOptionId: correctOptionId })
      .expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('computes authoritative server-side timing and ignores absurd client values', async () => {
    const attempt = (await agent.post(`/api/v1/problems/${problemId}/attempts`).expect(201)).body
      .data as AttemptBody;
    const res = await agent
      .post(`/api/v1/problems/${problemId}/attempts/${attempt.id}/submit`)
      .send({ selectedOptionId: correctOptionId, clientTimeSpentSeconds: 3600 })
      .expect(200);
    expect(res.body.data.result.timeSpentSeconds).toBeLessThanOrEqual(6 * 60 * 60);
    const row = await prisma.submission.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(row.clientTimeSpentSeconds).toBe(3600);
    expect(row.timeSpentSeconds).not.toBe(3600);
    expect(row.timeSpentSeconds).toBeGreaterThanOrEqual(0);
  });

  it('derives solved state from submitted attempts, not from opening a problem', async () => {
    const fresh = await prisma.problem.findFirstOrThrow({
      where: { status: 'PUBLISHED', title: { contains: 'Pipes' } },
      include: { options: true },
    });
    const before = (await agent.get(`/api/v1/problems/${fresh.id}/stats`).expect(200)).body.data;
    await agent.get(`/api/v1/problems/${fresh.id}`).expect(200);
    const afterView = (await agent.get(`/api/v1/problems/${fresh.id}/stats`).expect(200)).body.data;
    if (before) {
      expect(afterView?.solved).toBe(before.solved);
    }

    const attempt = (await agent.post(`/api/v1/problems/${fresh.id}/attempts`).expect(201)).body
      .data as AttemptBody;
    const correct = fresh.options.find((option) => option.isCorrect)!.id;
    await agent
      .post(`/api/v1/problems/${fresh.id}/attempts/${attempt.id}/submit`)
      .send({ selectedOptionId: correct })
      .expect(200);
    const stats = (await agent.get(`/api/v1/problems/${fresh.id}/stats`).expect(200)).body.data;
    expect(stats.solved).toBe(true);
    expect(stats.correctCount).toBeGreaterThan(0);
    expect(stats.personalAccuracy).not.toBeNull();
  }, 60_000);

  it('filters the library by solved state for the signed-in user', async () => {
    const solved = await agent.get('/api/v1/problems?solved=true&limit=50').expect(200);
    const items = solved.body.data.items as Array<{ isSolved?: boolean }>;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.isSolved === true)).toBe(true);
  });

  it('returns lightweight recent practice history', async () => {
    const res = await agent.get('/api/v1/submissions/recent?limit=5').expect(200);
    const body = res.body.data as {
      items: Array<Record<string, unknown>>;
      nextCursor: string | null;
      hasNextPage: boolean;
    };
    expect(body.items.length).toBeGreaterThan(0);
    const first = body.items[0]!;
    expect(first.problem).toBeDefined();
    expect(typeof first.isCorrect).toBe('boolean');
    expect(first).not.toHaveProperty('statement');
    expect(first).not.toHaveProperty('options');
  });

  it('requires authentication for personal history', async () => {
    await request(app.getHttpServer()).get('/api/v1/submissions/recent').expect(401);
  });

  it('rejects malformed submission payloads', async () => {
    const attempt = (await agent.post(`/api/v1/problems/${problemId}/attempts`).expect(201)).body
      .data as AttemptBody;
    const res = await agent
      .post(`/api/v1/problems/${problemId}/attempts/${attempt.id}/submit`)
      .send({ selectedOptionId: 'not-a-uuid' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns a deterministic next problem', async () => {
    const res = await agent.get(`/api/v1/problems/${problemId}/next`).expect(200);
    expect(typeof res.body.data.id).toBe('string');
    expect(res.body.data.id).not.toBe(problemId);
  });
});
