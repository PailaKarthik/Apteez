import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@apteez/database';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { type Env, validateEnv } from '../src/config/env';

interface ProblemSummary {
  id: string;
  title: string;
  difficulty: string;
  rating: number;
  accuracy: number | null;
  category: { slug: string };
  topic: { slug: string };
  examTags: Array<{ slug: string }>;
  hasExplanation: boolean;
  isSolved?: boolean;
  isFavorited?: boolean;
}

interface ProblemDetail extends ProblemSummary {
  statement: string | null;
  options: Array<{ id: string; position: number; text: string | null; assetUrl: string | null }>;
  assets: Array<{ url: string }>;
}

describe('Problems (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let draftProblemId: string;

  beforeAll(async () => {
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
    prisma = app.get(PrismaService);

    const member = await prisma.user.findUniqueOrThrow({ where: { email: 'member@apteez.dev' } });
    const topic = await prisma.topic.findFirstOrThrow({ where: { slug: 'percentages' } });
    const draft = await prisma.problem.create({
      data: {
        title: 'E2E draft problem that must stay hidden',
        statement: 'This draft must never appear in public listings.',
        status: 'DRAFT',
        categoryId: topic.categoryId,
        topicId: topic.id,
        creatorId: member.id,
        options: {
          create: [
            { position: 0, text: 'A', isCorrect: true },
            { position: 1, text: 'B' },
          ],
        },
      },
    });
    draftProblemId = draft.id;
  }, 60_000);

  afterAll(async () => {
    if (draftProblemId) {
      await prisma.problem.deleteMany({ where: { id: draftProblemId } });
    }
    await app?.close();
  });

  it('lists only published problems with cursor metadata', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/problems?limit=5').expect(200);
    const body = res.body.data as {
      items: ProblemSummary[];
      nextCursor: string | null;
      hasNextPage: boolean;
    };
    expect(body.items.length).toBe(5);
    expect(body.hasNextPage).toBe(true);
    expect(body.nextCursor).toBeTruthy();
    expect(body.items.every((item) => item.id !== draftProblemId)).toBe(true);
  });

  it('paginates without duplicates or gaps using the cursor', async () => {
    const first = await request(app.getHttpServer()).get('/api/v1/problems?limit=6').expect(200);
    const cursor = first.body.data.nextCursor as string;
    const second = await request(app.getHttpServer())
      .get(`/api/v1/problems?limit=6&cursor=${encodeURIComponent(cursor)}`)
      .expect(200);
    const firstIds = (first.body.data.items as ProblemSummary[]).map((item) => item.id);
    const secondIds = (second.body.data.items as ProblemSummary[]).map((item) => item.id);
    expect(secondIds.some((id) => firstIds.includes(id))).toBe(false);
  });

  it('filters by category and difficulty', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/problems?category=quantitative&difficulty=EASY&limit=50')
      .expect(200);
    const items = res.body.data.items as ProblemSummary[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.category.slug === 'quantitative')).toBe(true);
    expect(items.every((item) => item.difficulty === 'EASY')).toBe(true);
  });

  it('filters by rating range', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/problems?ratingMin=1200&ratingMax=1400&limit=50')
      .expect(200);
    const items = res.body.data.items as ProblemSummary[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.rating >= 1200 && item.rating <= 1400)).toBe(true);
  });

  it('filters by exam tag', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/problems?exam=banking&limit=50')
      .expect(200);
    const items = res.body.data.items as ProblemSummary[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.examTags.some((tag) => tag.slug === 'banking'))).toBe(true);
  });

  it('searches title and statement', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/problems?search=pipes&limit=50')
      .expect(200);
    const items = res.body.data.items as ProblemSummary[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((item) => item.title.toLowerCase().includes('pipes'))).toBe(true);
  });

  it('sorts by rating descending', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/problems?sort=rating_desc&limit=10')
      .expect(200);
    const ratings = (res.body.data.items as ProblemSummary[]).map((item) => item.rating);
    const sorted = [...ratings].sort((a, b) => b - a);
    expect(ratings).toEqual(sorted);
  });

  it('rejects invalid filter values with a structured error', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/problems?difficulty=IMPOSSIBLE&sort=raw_sql')
      .expect(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it('returns detail without ever exposing the correct answer', async () => {
    const list = await request(app.getHttpServer()).get('/api/v1/problems?limit=1').expect(200);
    const id = (list.body.data.items as ProblemSummary[])[0]!.id;
    const res = await request(app.getHttpServer()).get(`/api/v1/problems/${id}`).expect(200);
    const detail = res.body.data as ProblemDetail;
    expect(detail.options.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain('isCorrect');
    expect(detail.options.every((option) => !('isCorrect' in option))).toBe(true);
  });

  it('hides unpublished problems behind a 404', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/problems/${draftProblemId}`)
      .expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects a malformed problem id', async () => {
    await request(app.getHttpServer()).get('/api/v1/problems/not-a-uuid').expect(400);
  });

  it('returns the taxonomy: categories, topics and exam tags', async () => {
    const categories = await request(app.getHttpServer()).get('/api/v1/categories').expect(200);
    expect((categories.body.data as unknown[]).length).toBeGreaterThanOrEqual(7);

    const topics = await request(app.getHttpServer())
      .get('/api/v1/categories/quantitative/topics')
      .expect(200);
    expect((topics.body.data as unknown[]).length).toBeGreaterThan(0);

    const tags = await request(app.getHttpServer()).get('/api/v1/exam-tags').expect(200);
    expect((tags.body.data as unknown[]).length).toBeGreaterThanOrEqual(8);
  });

  it('serves problems by topic slug', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/topics/time-and-work/problems?limit=50')
      .expect(200);
    const items = res.body.data.items as ProblemSummary[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.topic.slug === 'time-and-work')).toBe(true);
  });

  it('attaches solved and favorited state for authenticated callers', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .send({ email: 'member@apteez.dev', password: 'apteez-dev-only' })
      .expect(200);

    const res = await agent.get('/api/v1/problems?limit=50').expect(200);
    const items = res.body.data.items as ProblemSummary[];
    expect(items.every((item) => typeof item.isSolved === 'boolean')).toBe(true);
    expect(items.some((item) => item.isSolved === true)).toBe(true);
    expect(items.some((item) => item.isFavorited === true)).toBe(true);

    const solved = await agent.get('/api/v1/problems?solved=true&limit=50').expect(200);
    const solvedItems = solved.body.data.items as ProblemSummary[];
    expect(solvedItems.length).toBeGreaterThan(0);
    expect(solvedItems.every((item) => item.isSolved === true)).toBe(true);
  }, 60_000);

  it('requires authentication to filter by personal state', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/problems?solved=true&limit=5')
      .expect(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });
});
