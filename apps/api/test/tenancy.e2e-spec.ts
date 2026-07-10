import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import passport, { Strategy } from 'passport';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { ClubRole, type Club, type User } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(30000);

describe('Tenant isolation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // The stubbed 'jwt' strategy authenticates every request as this user.
  let currentUser: User;

  let memberOfClubA: User;
  let clubA: Club;
  let clubB: Club;

  const unique = `tenancy-e2e-${Date.now()}`;

  /**
   * The global JwtAuthGuard is registered as APP_GUARD (whose provider token
   * is generated, so it cannot be overridden from a TestingModule). Instead
   * we stub the passport 'jwt' strategy itself: registering a strategy with
   * the same name replaces the real JwtStrategy, and the guard then sets
   * request.user to whatever the stub yields.
   */
  class StubJwtStrategy extends Strategy {
    name = 'jwt';
    authenticate(): void {
      (this as unknown as { success(user: User): void }).success(currentUser);
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

    // Replaces the real JwtStrategy (registered during app init).
    passport.use(new StubJwtStrategy());

    prisma = app.get(PrismaService);

    memberOfClubA = await prisma.user.create({
      data: {
        auth0Sub: `test|${unique}-member-a`,
        email: `${unique}-member-a@example.com`,
        name: 'Member of Club A',
      },
    });
    clubA = await prisma.club.create({
      data: {
        name: `${unique} Club A`,
        teams: { create: { name: 'Herren 1', sport: 'Tennis', rank: 1 } },
        memberships: {
          create: { userId: memberOfClubA.id, role: ClubRole.MEMBER },
        },
      },
    });
    clubB = await prisma.club.create({
      data: {
        name: `${unique} Club B`,
        teams: { create: { name: 'Damen 1', sport: 'Tennis', rank: 1 } },
      },
    });

    currentUser = memberOfClubA;
  });

  afterAll(async () => {
    // Cascades remove teams and memberships of the seeded clubs.
    await prisma.club.deleteMany({
      where: { id: { in: [clubA.id, clubB.id] } },
    });
    await prisma.user.deleteMany({ where: { id: memberOfClubA.id } });
    await app.close();
  });

  it('lets a member of club A read the teams of club A', async () => {
    const response = await request(app.getHttpServer())
      .get(`/clubs/${clubA.id}/teams`)
      .expect(200);

    const teams = response.body as Array<Record<string, unknown>>;
    expect(Array.isArray(teams)).toBe(true);
    expect(teams).toHaveLength(1);
    expect(teams[0]).toMatchObject({
      name: 'Herren 1',
      sport: 'Tennis',
      rank: 1,
      clubId: clubA.id,
    });
  });

  it('lists only club A in GET /clubs for a member of club A', async () => {
    const response = await request(app.getHttpServer())
      .get('/clubs')
      .expect(200);

    const ids = (response.body as Array<{ id: string }>).map((c) => c.id);
    expect(ids).toContain(clubA.id);
    expect(ids).not.toContain(clubB.id);
  });

  it('denies a member of club A access to the teams of club B', async () => {
    const response = await request(app.getHttpServer()).get(
      `/clubs/${clubB.id}/teams`,
    );

    expect([403, 404]).toContain(response.status);
  });

  it('denies a plain MEMBER creating a team in their own club', async () => {
    await request(app.getHttpServer())
      .post(`/clubs/${clubA.id}/teams`)
      .send({ name: 'Herren 2', sport: 'Tennis', rank: 2 })
      .expect(403);

    const teams = await prisma.team.findMany({ where: { clubId: clubA.id } });
    expect(teams).toHaveLength(1);
  });
});
