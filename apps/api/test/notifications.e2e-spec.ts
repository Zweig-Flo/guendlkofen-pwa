import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import passport, { Strategy } from 'passport';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { type User } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(30000);

describe('Notifications /me endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // Null → the stub strategy rejects the request (simulates no/invalid token).
  let currentUser: User | null;

  let userA: User;
  let userB: User;

  const unique = `notif-e2e-${Date.now()}`;
  const endpoint = `https://push.example.com/${unique}`;

  class StubJwtStrategy extends Strategy {
    name = 'jwt';
    authenticate(): void {
      const self = this as unknown as {
        success(user: User): void;
        fail(): void;
      };
      if (currentUser) self.success(currentUser);
      else self.fail();
    }
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    passport.use(new StubJwtStrategy());
    prisma = app.get(PrismaService);

    userA = await prisma.user.create({
      data: { auth0Sub: `test|${unique}-a`, email: `${unique}-a@example.com` },
    });
    userB = await prisma.user.create({
      data: { auth0Sub: `test|${unique}-b`, email: `${unique}-b@example.com` },
    });
    currentUser = userA;
  });

  afterAll(async () => {
    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    });
    await app.close();
  });

  it('GET /me/push/public-key returns a publicKey field', async () => {
    const res = await request(app.getHttpServer())
      .get('/me/push/public-key')
      .expect(200);
    expect(res.body).toHaveProperty('publicKey');
    expect(typeof (res.body as { publicKey: unknown }).publicKey).toBe(
      'string',
    );
  });

  it('401 without authentication', async () => {
    currentUser = null;
    await request(app.getHttpServer()).get('/me/push/public-key').expect(401);
    currentUser = userA;
  });

  it('rejects a subscription with a missing keys object (400)', async () => {
    await request(app.getHttpServer())
      .post('/me/push-subscriptions')
      .send({ endpoint })
      .expect(400);
  });

  it('subscribes userA to the endpoint', async () => {
    currentUser = userA;
    await request(app.getHttpServer())
      .post('/me/push-subscriptions')
      .send({
        endpoint,
        keys: { p256dh: 'pkA', auth: 'authA' },
        userAgent: 'UA',
      })
      .expect(204);

    const row = await prisma.pushSubscription.findUnique({
      where: { endpoint },
    });
    expect(row?.userId).toBe(userA.id);
    expect(row?.p256dh).toBe('pkA');
  });

  it('re-subscribing the same endpoint as userB moves ownership (single row)', async () => {
    currentUser = userB;
    await request(app.getHttpServer())
      .post('/me/push-subscriptions')
      .send({ endpoint, keys: { p256dh: 'pkB', auth: 'authB' } })
      .expect(204);

    const rows = await prisma.pushSubscription.findMany({
      where: { endpoint },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(userB.id);
    expect(rows[0].p256dh).toBe('pkB');
  });

  it("does not let userA delete userB's subscription (self-scoped no-op)", async () => {
    currentUser = userA;
    await request(app.getHttpServer())
      .delete('/me/push-subscriptions')
      .send({ endpoint })
      .expect(204);

    const row = await prisma.pushSubscription.findUnique({
      where: { endpoint },
    });
    expect(row?.userId).toBe(userB.id); // still there, still userB's
  });

  it('lets the owner delete their subscription', async () => {
    currentUser = userB;
    await request(app.getHttpServer())
      .delete('/me/push-subscriptions')
      .send({ endpoint })
      .expect(204);

    const row = await prisma.pushSubscription.findUnique({
      where: { endpoint },
    });
    expect(row).toBeNull();
  });

  it('deleting an unknown endpoint is a 204 no-op', async () => {
    currentUser = userA;
    await request(app.getHttpServer())
      .delete('/me/push-subscriptions')
      .send({ endpoint: 'https://push.example.com/does-not-exist' })
      .expect(204);
  });
});
