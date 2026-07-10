import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import passport, { Strategy } from 'passport';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  ClubRole,
  InvitationStatus,
  TeamRole,
  type Club,
  type Team,
  type User,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(30000);

describe('Invitations (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // The stubbed 'jwt' strategy authenticates every request as this user.
  let currentUser: User;

  let adminA: User;
  let adminB: User;
  let redeemer: User;
  let clubA: Club;
  let clubB: Club;
  let teamA: Team;

  const unique = `inv-e2e-${Date.now()}`;

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
    passport.use(new StubJwtStrategy());

    prisma = app.get(PrismaService);

    adminA = await prisma.user.create({
      data: {
        auth0Sub: `test|${unique}-admin-a`,
        email: `${unique}-admin-a@example.com`,
        name: 'Admin A',
      },
    });
    adminB = await prisma.user.create({
      data: {
        auth0Sub: `test|${unique}-admin-b`,
        email: `${unique}-admin-b@example.com`,
        name: 'Admin B',
      },
    });
    redeemer = await prisma.user.create({
      data: {
        auth0Sub: `test|${unique}-redeemer`,
        email: `${unique}-redeemer@example.com`,
        name: 'Redeemer',
      },
    });

    clubA = await prisma.club.create({
      data: {
        name: `${unique} Club A`,
        teams: { create: { name: 'Herren 1', sport: 'Tennis', rank: 1 } },
        memberships: {
          create: { userId: adminA.id, role: ClubRole.CLUB_ADMIN },
        },
      },
      include: { teams: true },
    });
    teamA = (clubA as Club & { teams: Team[] }).teams[0];

    clubB = await prisma.club.create({
      data: {
        name: `${unique} Club B`,
        memberships: {
          create: { userId: adminB.id, role: ClubRole.CLUB_ADMIN },
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.club.deleteMany({
      where: { id: { in: [clubA.id, clubB.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [adminA.id, adminB.id, redeemer.id] } },
    });
    await app.close();
  });

  const invitedEmail = () => `${unique}-invited@example.com`;

  it('lets a club admin create a PENDING invitation', async () => {
    currentUser = adminA;
    const response = await request(app.getHttpServer())
      .post(`/clubs/${clubA.id}/invitations`)
      .send({
        email: invitedEmail(),
        clubRole: ClubRole.MEMBER,
        teamAssignments: [{ teamId: teamA.id, role: TeamRole.PLAYER }],
      })
      .expect(201);

    const body = response.body as Record<string, unknown>;
    expect(body).toMatchObject({
      clubId: clubA.id,
      email: invitedEmail(),
      status: InvitationStatus.PENDING,
    });
    // The token must never leak into the response.
    expect(JSON.stringify(body)).not.toContain('token');

    const row = await prisma.invitation.findFirst({
      where: { clubId: clubA.id, email: invitedEmail() },
    });
    expect(row?.status).toBe(InvitationStatus.PENDING);
    expect(row?.token).toBeTruthy();
  });

  it('forbids a foreign club admin from inviting into another club', async () => {
    currentUser = adminB;
    await request(app.getHttpServer())
      .post(`/clubs/${clubA.id}/invitations`)
      .send({ email: `${unique}-foreign@example.com` })
      .expect(403);
  });

  it('redeems the invitation as a different user and links memberships', async () => {
    const row = await prisma.invitation.findFirstOrThrow({
      where: { clubId: clubA.id, email: invitedEmail() },
    });

    currentUser = redeemer;
    await request(app.getHttpServer())
      .post('/invitations/redeem')
      .send({ token: row.token })
      .expect(201);

    const clubMembership = await prisma.clubMembership.findUnique({
      where: {
        userId_clubId: { userId: redeemer.id, clubId: clubA.id },
      },
    });
    expect(clubMembership?.role).toBe(ClubRole.MEMBER);

    const teamMembership = await prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId: redeemer.id, teamId: teamA.id } },
    });
    expect(teamMembership?.role).toBe(TeamRole.PLAYER);

    const accepted = await prisma.invitation.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(accepted.status).toBe(InvitationStatus.ACCEPTED);
    expect(accepted.acceptedById).toBe(redeemer.id);
  });

  it('rejects a second redemption of the same token with 410 Gone', async () => {
    const row = await prisma.invitation.findFirstOrThrow({
      where: { clubId: clubA.id, email: invitedEmail() },
    });

    currentUser = redeemer;
    await request(app.getHttpServer())
      .post('/invitations/redeem')
      .send({ token: row.token })
      .expect(410);
  });
});
