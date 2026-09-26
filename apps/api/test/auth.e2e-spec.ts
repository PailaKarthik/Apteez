import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '@apteez/database';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { Roles } from '../src/common/decorators/roles.decorator';
import { Permissions } from '../src/common/decorators/permissions.decorator';
import { type Env, validateEnv } from '../src/config/env';
import { UsersService } from '../src/modules/users/users.service';

/**
 * Authentication + RBAC end-to-end. Boots the real application against the
 * docker Postgres/Redis services and exercises the full HTTP contract:
 * registration, login, sessions, logout, guards and rate-limit budgets.
 *
 * The per-IP endpoint throttle is relaxed via ConfigService (deterministic
 * suite) while the full guard chain — including the Redis throttler storage
 * — stays active. The per-account login budget keeps production limits.
 */
@Controller('test-rbac')
class TestRbacController {
  @Get('admin')
  @Roles('admin')
  adminOnly(): { area: string } {
    return { area: 'admin' };
  }

  @Get('review')
  @Permissions('review:contributions')
  reviewOnly(): { area: string } {
    return { area: 'review' };
  }
}

describe('Auth (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let users: UsersService;
  const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  let n = 0;

  const freshAccount = (overrides: Record<string, string> = {}) => {
    n += 1;
    return {
      displayName: 'E2E Solver',
      username: `e2e_${runId}_${n}`.slice(0, 30),
      email: `e2e-${runId}-${n}@apteez.dev`,
      password: 'correct-horse-battery-staple',
      ...overrides,
    };
  };

  beforeAll(async () => {
    const realEnv = validateEnv(process.env);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestRbacController],
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
    users = app.get(UsersService);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  async function grantRole(email: string, roleName: string): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }

  it('registers a user, sets a session cookie and assigns only the user role', async () => {
    const account = freshAccount();
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ ...account, roles: ['admin'] })
      .expect(201);
    expect(response.body.success).toBe(true);
    const setCookieHeader = response.headers['set-cookie'];
    const cookieText = Array.isArray(setCookieHeader)
      ? setCookieHeader.join(';')
      : String(setCookieHeader ?? '');
    expect(cookieText).toMatch(/apteez_session=[^;]+/);
    expect(cookieText).toMatch(/HttpOnly/i);
    expect(response.body.data.user.email).toBe(account.email);
    expect(response.body.data.user.roles).toEqual(['user']);
    expect(response.body.data.user.passwordHash).toBeUndefined();
  });

  it('rejects duplicate email and username with the same generic error', async () => {
    const account = freshAccount();
    await request(app.getHttpServer()).post('/api/v1/auth/register').send(account).expect(201);
    const byEmail = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ ...freshAccount(), email: account.email })
      .expect(409);
    const byUsername = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ ...freshAccount(), username: account.username })
      .expect(409);
    expect(byEmail.body.error.code).toBe('ACCOUNT_EXISTS');
    expect(byUsername.body.error.code).toBe('ACCOUNT_EXISTS');
    expect(byEmail.body.error.message).toBe(byUsername.body.error.message);
  });

  it('logs in, reads /me, logs out, and rejects the session afterwards', async () => {
    const account = freshAccount();
    await request(app.getHttpServer()).post('/api/v1/auth/register').send(account).expect(201);
    const agent = request.agent(app.getHttpServer());
    const login = await agent
      .post('/api/v1/auth/login')
      .send({ email: account.email, password: account.password })
      .expect(200);
    expect(login.body.data.user.email).toBe(account.email);

    const me = await agent.get('/api/v1/auth/me').expect(200);
    expect(Object.keys(me.body.data).sort()).toEqual(
      [
        'avatarKey',
        'bio',
        'country',
        'displayName',
        'email',
        'id',
        'institution',
        'isActive',
        'isPrivate',
        'permissions',
        'roles',
        'timezone',
        'username',
      ].sort(),
    );
    expect(me.body.data.roles).toEqual(['user']);

    await agent.post('/api/v1/auth/logout').expect(200);
    // Presenting the revoked token directly must fail as expired: the
    // server-side session is gone even though the client still holds it.
    const setCookies = login.headers['set-cookie'];
    const rawCookie = (Array.isArray(setCookies) ? setCookies.map(String) : [])
      .find((cookie) => cookie.startsWith('apteez_session='))
      ?.split(';')[0];
    const expired = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', rawCookie ?? '')
      .expect(401);
    expect(expired.body.error.code).toBe('SESSION_EXPIRED');
    // Logout stays idempotent after the session is already gone.
    await agent.post('/api/v1/auth/logout').expect(200);
  });

  it('returns identical errors for unknown accounts and wrong passwords', async () => {
    // Fresh address every run: login budgets live in Redis across runs.
    const unknownEmail = `no-such-user-${runId}@apteez.dev`;
    const wrong = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: unknownEmail, password: 'wrong-password-123' })
      .expect(401);
    const account = freshAccount();
    await request(app.getHttpServer()).post('/api/v1/auth/register').send(account).expect(201);
    const unknown = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: account.email, password: 'wrong-password-123' })
      .expect(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('rejects disabled accounts only after a correct password', async () => {
    const account = freshAccount();
    await request(app.getHttpServer()).post('/api/v1/auth/register').send(account).expect(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: account.email } });
    await users.setActive(user.id, false);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: account.email, password: account.password })
      .expect(403)
      .expect((res) => {
        if (res.body.error.code !== 'ACCOUNT_DISABLED') {
          throw new Error(`expected ACCOUNT_DISABLED, got ${res.body.error.code}`);
        }
      });
  });

  it('locks out brute-force login budgets with 429', async () => {
    const account = freshAccount();
    await request(app.getHttpServer()).post('/api/v1/auth/register').send(account).expect(201);
    const agent = request.agent(app.getHttpServer());
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await agent
        .post('/api/v1/auth/login')
        .send({ email: account.email, password: 'wrong-password-123' })
        .expect(401);
    }
    const locked = await agent
      .post('/api/v1/auth/login')
      .send({ email: account.email, password: 'wrong-password-123' })
      .expect(429);
    expect(locked.body.error.code).toBe('RATE_LIMITED');
  }, 60_000);

  it('rejects unauthenticated /me with AUTH_REQUIRED', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    expect(response.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('refuses cross-origin mutations (CSRF origin check)', async () => {
    const account = freshAccount();
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Origin', 'https://evil.example')
      .send(account)
      .expect(403)
      .expect((res) => {
        if (res.body.error.code !== 'FORBIDDEN') {
          throw new Error(`expected FORBIDDEN, got ${res.body.error.code}`);
        }
      });
  });

  it('enforces role and permission guards end to end', async () => {
    const member = freshAccount();
    const admin = freshAccount();
    for (const account of [member, admin]) {
      await request(app.getHttpServer()).post('/api/v1/auth/register').send(account).expect(201);
    }
    await grantRole(admin.email, 'admin');

    const loginAs = async (email: string, password: string) => {
      const agent = request.agent(app.getHttpServer());
      await agent.post('/api/v1/auth/login').send({ email, password }).expect(200);
      return agent;
    };
    const memberAgent = await loginAs(member.email, member.password);
    const adminAgent = await loginAs(admin.email, admin.password);

    await request(app.getHttpServer()).get('/api/v1/test-rbac/admin').expect(401);
    await memberAgent.get('/api/v1/test-rbac/admin').expect(403);
    await adminAgent.get('/api/v1/test-rbac/admin').expect(200);

    await memberAgent.get('/api/v1/test-rbac/review').expect(403);
    const review = await adminAgent.get('/api/v1/test-rbac/review').expect(200);
    expect(review.body).toEqual({ success: true, data: { area: 'review' } });
  }, 60_000);
});
