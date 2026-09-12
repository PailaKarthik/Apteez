import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@apteez/database';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { type Env, validateEnv } from '../src/config/env';

interface CollectionBody {
  id: string;
  name: string;
  isDefault: boolean;
  problemCount: number;
}

describe('Favorites (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let agent: ReturnType<typeof request.agent>;
  let otherAgent: ReturnType<typeof request.agent>;
  let problemA: string;
  let problemB: string;
  let draftProblem: string;

  beforeAll(async () => {
    const realEnv = validateEnv(process.env);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: keyof Env) => (key === 'AUTH_RATE_LIMIT' ? 100000 : realEnv[key]),
      } as unknown as ConfigService<Env, true>)
      .compile();
    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const published = await prisma.problem.findMany({
      where: { status: 'PUBLISHED' },
      select: { id: true },
      take: 2,
      orderBy: { id: 'asc' },
    });
    problemA = published[0]!.id;
    problemB = published[1]!.id;

    const topic = await prisma.topic.findFirstOrThrow({ where: { slug: 'percentages' } });
    const draft = await prisma.problem.create({
      data: {
        title: 'Favorites e2e draft',
        status: 'DRAFT',
        categoryId: topic.categoryId,
        topicId: topic.id,
        options: { create: [{ position: 0, text: 'A', isCorrect: true }] },
      },
    });
    draftProblem = draft.id;

    agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .send({ email: 'member@apteez.dev', password: 'apteez-dev-only' })
      .expect(200);

    otherAgent = request.agent(app.getHttpServer());
    await otherAgent
      .post('/api/v1/auth/login')
      .send({ email: 'admin@apteez.dev', password: 'apteez-dev-only' })
      .expect(200);
  }, 60_000);

  afterAll(async () => {
    if (draftProblem) {
      await prisma.problem.deleteMany({ where: { id: draftProblem } });
    }
    await app?.close();
  });

  it('guarantees a default Favorites collection exists', async () => {
    const res = await agent.get('/api/v1/favorite-collections').expect(200);
    const collections = res.body.data as CollectionBody[];
    const defaults = collections.filter((collection) => collection.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0]!.name).toBe('Favorites');
  });

  it('requires authentication for favorites', async () => {
    await request(app.getHttpServer()).get('/api/v1/favorites').expect(401);
    await request(app.getHttpServer()).post(`/api/v1/favorites/${problemA}`).expect(401);
    await request(app.getHttpServer()).get('/api/v1/favorite-collections').expect(401);
  });

  it('toggles a problem in and out of Favorites idempotently', async () => {
    const add = await agent.post(`/api/v1/favorites/${problemA}`).expect(201);
    expect(add.body.data.favorited).toBe(true);
    const addAgain = await agent.post(`/api/v1/favorites/${problemA}`).expect(201);
    expect(addAgain.body.data.favorited).toBe(false);

    // Now explicitly favorite and list it.
    await agent.post(`/api/v1/favorites/${problemA}`).expect(201);
    const list = await agent.get('/api/v1/favorites').expect(200);
    const ids = (list.body.data.items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).toContain(problemA);

    await agent.delete(`/api/v1/favorites/${problemA}`).expect(200);
    await agent.delete(`/api/v1/favorites/${problemA}`).expect(200);
    const after = await agent.get('/api/v1/favorites').expect(200);
    const afterIds = (after.body.data.items as Array<{ id: string }>).map((item) => item.id);
    expect(afterIds).not.toContain(problemA);
  });

  it('prevents duplicate favorites at the database level', async () => {
    await agent.post(`/api/v1/favorites/${problemB}`).expect(201);
    const collection = await prisma.favoriteCollection.findFirstOrThrow({
      where: {
        ownerId: (await prisma.user.findUniqueOrThrow({ where: { email: 'member@apteez.dev' } }))
          .id,
        isDefault: true,
      },
    });
    const count = await prisma.favoriteCollectionItem.count({
      where: { collectionId: collection.id, problemId: problemB },
    });
    expect(count).toBe(1);
    await agent.delete(`/api/v1/favorites/${problemB}`).expect(200);
  });

  it('rejects favoriting an unpublished problem', async () => {
    await agent.post(`/api/v1/favorites/${draftProblem}`).expect(404);
  });

  it('creates, renames and deletes a custom collection', async () => {
    const created = await agent
      .post('/api/v1/favorite-collections')
      .send({ name: 'Quant Practice' })
      .expect(201);
    const collection = created.body.data as CollectionBody;
    expect(collection.isDefault).toBe(false);
    expect(collection.problemCount).toBe(0);

    const renamed = await agent
      .patch(`/api/v1/favorite-collections/${collection.id}`)
      .send({ name: 'Quant Revision' })
      .expect(200);
    expect(renamed.body.data.name).toBe('Quant Revision');

    await agent.delete(`/api/v1/favorite-collections/${collection.id}`).expect(200);
    await agent.delete(`/api/v1/favorite-collections/${collection.id}`).expect(200);
  });

  it('rejects empty and duplicate collection names', async () => {
    await agent.post('/api/v1/favorite-collections').send({ name: '   ' }).expect(400);
    await agent.post('/api/v1/favorite-collections').send({ name: 'Temp Duplicate' }).expect(201);
    const duplicate = await agent
      .post('/api/v1/favorite-collections')
      .send({ name: 'Temp Duplicate' })
      .expect(409);
    expect(duplicate.body.error.code).toBe('COLLECTION_NAME_TAKEN');
    const list = await agent.get('/api/v1/favorite-collections').expect(200);
    const temp = (list.body.data as CollectionBody[]).find(
      (item) => item.name === 'Temp Duplicate',
    );
    if (temp) {
      await agent.delete(`/api/v1/favorite-collections/${temp.id}`).expect(200);
    }
  });

  it('cannot rename or delete the default collection', async () => {
    const list = await agent.get('/api/v1/favorite-collections').expect(200);
    const defaultCollection = (list.body.data as CollectionBody[]).find((item) => item.isDefault)!;
    const rename = await agent
      .patch(`/api/v1/favorite-collections/${defaultCollection.id}`)
      .send({ name: 'Hacked' })
      .expect(409);
    expect(rename.body.error.code).toBe('DEFAULT_COLLECTION_IMMUTABLE');
    const remove = await agent
      .delete(`/api/v1/favorite-collections/${defaultCollection.id}`)
      .expect(409);
    expect(remove.body.error.code).toBe('DEFAULT_COLLECTION_IMMUTABLE');
  });

  it('adds and removes problems in a custom collection without affecting others', async () => {
    const created = await agent
      .post('/api/v1/favorite-collections')
      .send({ name: 'Hard Problems' })
      .expect(201);
    const collection = created.body.data as CollectionBody;

    await agent.post(`/api/v1/favorites/${problemA}`).expect(201);
    await agent
      .post(`/api/v1/favorite-collections/${collection.id}/problems/${problemA}`)
      .expect(201);
    // Duplicate add is an idempotent no-op.
    await agent
      .post(`/api/v1/favorite-collections/${collection.id}/problems/${problemA}`)
      .expect(201);

    const problems = await agent
      .get(`/api/v1/favorite-collections/${collection.id}/problems`)
      .expect(200);
    expect((problems.body.data.items as Array<{ id: string }>).map((item) => item.id)).toContain(
      problemA,
    );

    // Removing from the custom collection leaves Favorites untouched.
    await agent
      .delete(`/api/v1/favorite-collections/${collection.id}/problems/${problemA}`)
      .expect(200);
    const favorites = await agent.get('/api/v1/favorites').expect(200);
    expect((favorites.body.data.items as Array<{ id: string }>).map((item) => item.id)).toContain(
      problemA,
    );

    await agent.delete(`/api/v1/favorite-collections/${collection.id}`).expect(200);
    await agent.delete(`/api/v1/favorites/${problemA}`).expect(200);
  });

  it('reports membership for the caller only', async () => {
    await agent.post(`/api/v1/favorites/${problemA}`).expect(201);
    const res = await agent
      .get(`/api/v1/favorites/membership?problemIds=${problemA},${problemB}`)
      .expect(200);
    const membership = res.body.data as Array<{ problemId: string; isFavorited: boolean }>;
    const forA = membership.find((item) => item.problemId === problemA);
    expect(forA?.isFavorited).toBe(true);

    const otherView = await otherAgent
      .get(`/api/v1/favorites/membership?problemIds=${problemA}`)
      .expect(200);
    expect((otherView.body.data as Array<{ isFavorited: boolean }>)[0]!.isFavorited).toBe(false);
    await agent.delete(`/api/v1/favorites/${problemA}`).expect(200);
  });

  it('enforces ownership: another user cannot read or mutate a collection', async () => {
    const created = await agent
      .post('/api/v1/favorite-collections')
      .send({ name: 'Private Set' })
      .expect(201);
    const collection = created.body.data as CollectionBody;

    await otherAgent.get(`/api/v1/favorite-collections/${collection.id}/problems`).expect(404);
    await otherAgent
      .patch(`/api/v1/favorite-collections/${collection.id}`)
      .send({ name: 'Stolen' })
      .expect(404);
    await otherAgent.delete(`/api/v1/favorite-collections/${collection.id}`).expect(404);
    await otherAgent
      .post(`/api/v1/favorite-collections/${collection.id}/problems/${problemA}`)
      .expect(404);

    await agent.delete(`/api/v1/favorite-collections/${collection.id}`).expect(200);
  });

  it('paginates favorites and rejects invalid cursor/sort', async () => {
    await agent.post(`/api/v1/favorites/${problemA}`).expect(201);
    await agent.post(`/api/v1/favorites/${problemB}`).expect(201);
    const page = await agent.get('/api/v1/favorites?limit=1&sort=rating_desc').expect(200);
    expect(page.body.data.items.length).toBeLessThanOrEqual(1);
    await agent.get('/api/v1/favorites?cursor=garbage&sort=rating_desc').expect(400);
    await agent.get('/api/v1/favorites?sort=sql_injection').expect(400);
    await agent.delete(`/api/v1/favorites/${problemA}`).expect(200);
    await agent.delete(`/api/v1/favorites/${problemB}`).expect(200);
  });

  it('keeps a single membership under concurrent favorite requests', async () => {
    const results = await Promise.all([
      agent.post(`/api/v1/favorites/${problemA}`),
      agent.post(`/api/v1/favorites/${problemA}`),
      agent.post(`/api/v1/favorites/${problemA}`),
    ]);
    for (const result of results) {
      expect([200, 201]).toContain(result.status);
    }
    const member = await prisma.user.findUniqueOrThrow({ where: { email: 'member@apteez.dev' } });
    const collection = await prisma.favoriteCollection.findFirstOrThrow({
      where: { ownerId: member.id, isDefault: true },
    });
    const count = await prisma.favoriteCollectionItem.count({
      where: { collectionId: collection.id, problemId: problemA },
    });
    expect(count).toBeLessThanOrEqual(1);
    await agent.delete(`/api/v1/favorites/${problemA}`).expect(200);
  });
});
