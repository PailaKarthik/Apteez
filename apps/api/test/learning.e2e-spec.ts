import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@apteez/database';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';

interface LessonDetail {
  id: string;
  title: string;
  content: Array<{ kind: string; value?: string }>;
  progressStatus?: 'STARTED' | 'COMPLETED';
  navigation: {
    prevLesson: { id: string; title: string } | null;
    nextLesson: { id: string; title: string } | null;
    position: number;
    total: number;
  };
}

describe('Learning (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let pathSlug: string;
  let topicSlug: string;
  let lessonSlug: string;
  let memberId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const category = await prisma.category.findUniqueOrThrow({ where: { slug: 'quantitative' } });

    pathSlug = `learning-e2e-path-${Date.now()}`;
    topicSlug = `learning-e2e-topic-${Date.now()}`;
    lessonSlug = `learning-e2e-lesson-${Date.now()}`;

    const path = await prisma.learningPath.create({
      data: {
        slug: pathSlug,
        title: 'Learning e2e path',
        description: 'Temporary path for the learning e2e spec.',
        categoryId: category.id,
        status: 'PUBLISHED',
        estimatedMinutes: 10,
        order: 99,
      },
    });
    const topic = await prisma.learningTopic.create({
      data: {
        pathId: path.id,
        slug: topicSlug,
        title: 'Learning e2e topic',
        status: 'PUBLISHED',
        order: 0,
        lessonCount: 2,
      },
    });
    const lessonBody = [
      { kind: 'heading', value: 'Heading' },
      { kind: 'text', value: 'Body text' },
      { kind: 'formula', value: 'a = b + c' },
      { kind: 'note', value: 'Watch out' },
      { kind: 'example', value: 'Worked example' },
      { kind: 'list', value: 'Steps', items: ['one', 'two'] },
    ];
    await prisma.learningLesson.createMany({
      data: [
        {
          topicId: topic.id,
          slug: lessonSlug,
          title: 'First lesson',
          status: 'PUBLISHED',
          content: lessonBody as never,
          estimatedMinutes: 5,
          order: 0,
        },
        {
          topicId: topic.id,
          slug: `${lessonSlug}-second`,
          title: 'Second lesson',
          status: 'PUBLISHED',
          content: lessonBody as never,
          estimatedMinutes: 5,
          order: 1,
        },
        {
          topicId: topic.id,
          slug: `${lessonSlug}-draft`,
          title: 'Draft lesson',
          status: 'DRAFT',
          content: lessonBody as never,
          estimatedMinutes: 5,
          order: 2,
        },
      ],
    });

    const publishedProblem = await prisma.problem.findFirstOrThrow({
      where: { status: 'PUBLISHED', categoryId: category.id },
    });
    const firstLesson = await prisma.learningLesson.findFirstOrThrow({
      where: { topicId: topic.id, slug: lessonSlug },
    });
    await prisma.learningLessonProblem.create({
      data: {
        lessonId: firstLesson.id,
        problemId: publishedProblem.id,
        practiceCount: 2,
        order: 0,
      },
    });

    const member = await prisma.user.findUniqueOrThrow({ where: { email: 'member@apteez.dev' } });
    memberId = member.id;
  }, 60_000);

  afterAll(async () => {
    await prisma.learningLessonProblem.deleteMany({
      where: { lesson: { topic: { path: { slug: pathSlug } } } },
    });
    await prisma.userLearningProgress.deleteMany({
      where: { lesson: { topic: { path: { slug: pathSlug } } } },
    });
    await prisma.learningLesson.deleteMany({ where: { topic: { path: { slug: pathSlug } } } });
    await prisma.learningTopic.deleteMany({ where: { path: { slug: pathSlug } } });
    await prisma.learningPath.deleteMany({ where: { slug: pathSlug } });
    await app?.close();
  });

  function memberAgent(): ReturnType<typeof request.agent> {
    const agent = request.agent(app.getHttpServer());
    return agent;
  }

  async function login(agent: ReturnType<typeof request.agent>, email: string): Promise<void> {
    await agent.post('/api/v1/auth/login').send({ email, password: 'apteez-dev-only' }).expect(200);
  }

  it('lists published learning paths publicly', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/learning/paths').expect(200);
    const paths = res.body.data as Array<{ slug: string }>;
    expect(paths.some((path) => path.slug === pathSlug)).toBe(true);
  });

  it('exposes path detail with published topics', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/learning/paths/${pathSlug}`)
      .expect(200);
    const body = res.body.data as { slug: string; topics: Array<{ slug: string }> };
    expect(body.slug).toBe(pathSlug);
    expect(body.topics.length).toBeGreaterThan(0);
  });

  it('returns 404 for an unknown path', async () => {
    await request(app.getHttpServer()).get('/api/v1/learning/paths/no-such-path').expect(404);
  });

  it('returns topic detail with ordered published lessons', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/learning/topics/${topicSlug}`)
      .expect(200);
    const body = res.body.data as { lessons: Array<{ slug: string }> };
    expect(body.lessons.map((lesson) => lesson.slug)).toEqual([lessonSlug, `${lessonSlug}-second`]);
  });

  it('excludes draft lessons from detail responses', async () => {
    const body = (
      await request(app.getHttpServer()).get(`/api/v1/learning/topics/${topicSlug}`).expect(200)
    ).body.data as { lessons: Array<{ slug: string }> };
    expect(body.lessons.some((lesson) => lesson.slug.endsWith('draft'))).toBe(false);
  });

  it('returns lesson detail with content, practice refs and navigation', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/learning/lessons/${topicSlug}/${lessonSlug}`)
      .expect(200);
    const body = res.body.data as LessonDetail;
    expect(body.title).toBe('First lesson');
    expect(body.content.some((block) => block.kind === 'formula')).toBe(true);
    expect(body.content.some((block) => block.kind === 'list')).toBe(true);
    expect(body.navigation.position).toBe(1);
    expect(body.navigation.total).toBe(2);
    expect(body.navigation.nextLesson?.title).toBe('Second lesson');
  });

  it('returns 404 for an unpublished lesson', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/learning/lessons/${topicSlug}/${lessonSlug}-draft`)
      .expect(404);
  });

  it('requires authentication for progress endpoints', async () => {
    await request(app.getHttpServer()).get('/api/v1/learning/progress').expect(401);
    await request(app.getHttpServer())
      .post(`/api/v1/learning/lessons/${topicSlug}/${lessonSlug}/complete`)
      .expect(401);
  });

  it('starts a lesson and is idempotent (one progress row)', async () => {
    const agent = memberAgent();
    await login(agent, 'member@apteez.dev');
    await agent.post(`/api/v1/learning/lessons/${topicSlug}/${lessonSlug}/start`).expect(201);
    await agent.post(`/api/v1/learning/lessons/${topicSlug}/${lessonSlug}/start`).expect(201);
    const rows = await prisma.userLearningProgress.count({
      where: { userId: memberId, lesson: { slug: lessonSlug } },
    });
    expect(rows).toBe(1);
  });

  it('completes a lesson server-side and reports progress', async () => {
    const agent = memberAgent();
    await login(agent, 'member@apteez.dev');
    const res = await agent
      .post(`/api/v1/learning/lessons/${topicSlug}/${lessonSlug}/complete`)
      .expect(201);
    const body = res.body.data as LessonDetail;
    expect(body.progressStatus).toBe('COMPLETED');

    const summary = (await agent.get('/api/v1/learning/progress').expect(200)).body.data as {
      completedLessons: number;
      completedPercent: number;
      resume: { lessonSlug: string } | null;
    };
    expect(summary.completedLessons).toBeGreaterThanOrEqual(1);
    expect(summary.completedPercent).toBeGreaterThan(0);
    expect(summary.resume?.lessonSlug).toBe(lessonSlug);
  });

  it('keeps progress owned per user (other users do not mutate mine)', async () => {
    const other = memberAgent();
    await login(other, 'admin@apteez.dev');
    await other.post(`/api/v1/learning/lessons/${topicSlug}/${lessonSlug}/complete`).expect(201);

    const mine = memberAgent();
    await login(mine, 'member@apteez.dev');
    const own = (await mine.get('/api/v1/learning/progress').expect(200)).body.data as {
      completedLessons: number;
      totalPublishedLessons: number;
    };
    expect(own.completedLessons).toBeGreaterThanOrEqual(1);
    expect(own.totalPublishedLessons).toBeGreaterThan(0);
  });

  it('exposes related problems through lesson practice refs', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/learning/lessons/${topicSlug}/${lessonSlug}`)
      .expect(200);
    const body = res.body.data as { practice: Array<{ problemId: string }>; hasPractice: boolean };
    expect(body.hasPractice).toBe(true);
    expect(body.practice.length).toBeGreaterThan(0);
  });

  it('tracks the resume pointer via authenticated detail reads', async () => {
    const agent = memberAgent();
    await login(agent, 'member@apteez.dev');
    await agent.get(`/api/v1/learning/lessons/${topicSlug}/${lessonSlug}-second`).expect(200);
    const summary = (await agent.get('/api/v1/learning/progress').expect(200)).body.data as {
      resume: { lessonSlug: string } | null;
    };
    expect(summary.resume?.lessonSlug).toBe(`${lessonSlug}-second`);
  });
});
