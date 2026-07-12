import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import passport, { Strategy } from 'passport';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  ClubRole,
  TeamRole,
  type Club,
  type Team,
  type User,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(30000);

describe('Team chat (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // The stubbed 'jwt' strategy authenticates every request as this user.
  let currentUser: User;

  let author: User; // PLAYER on team A1
  let teamAdmin: User; // TEAM_ADMIN on team A1
  let clubMemberOffTeam: User; // MEMBER of club A but NOT on team A1
  let outsider: User; // MEMBER of club B only

  let clubA: Club;
  let clubB: Club;
  let teamA1: Team;

  const unique = `chat-e2e-${Date.now()}`;

  class StubJwtStrategy extends Strategy {
    name = 'jwt';
    authenticate(): void {
      (this as unknown as { success(user: User): void }).success(currentUser);
    }
  }

  const asUser = (user: User): App => {
    currentUser = user;
    return app.getHttpServer();
  };

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

    const mkUser = (suffix: string, name: string): Promise<User> =>
      prisma.user.create({
        data: {
          auth0Sub: `test|${unique}-${suffix}`,
          email: `${unique}-${suffix}@example.com`,
          name,
        },
      });

    author = await mkUser('author', 'Author Player');
    teamAdmin = await mkUser('admin', 'Team Admin');
    clubMemberOffTeam = await mkUser('offteam', 'Club Member Off Team');
    outsider = await mkUser('outsider', 'Outsider');

    clubA = await prisma.club.create({
      data: {
        name: `${unique} Club A`,
        teams: { create: { name: 'Herren 1', sport: 'Tennis', rank: 1 } },
      },
    });
    teamA1 = await prisma.team.findFirstOrThrow({
      where: { clubId: clubA.id },
    });
    clubB = await prisma.club.create({ data: { name: `${unique} Club B` } });

    await prisma.clubMembership.createMany({
      data: [
        { userId: author.id, clubId: clubA.id, role: ClubRole.MEMBER },
        { userId: teamAdmin.id, clubId: clubA.id, role: ClubRole.MEMBER },
        {
          userId: clubMemberOffTeam.id,
          clubId: clubA.id,
          role: ClubRole.MEMBER,
        },
        { userId: outsider.id, clubId: clubB.id, role: ClubRole.MEMBER },
      ],
    });
    await prisma.teamMembership.createMany({
      data: [
        { userId: author.id, teamId: teamA1.id, role: TeamRole.PLAYER },
        { userId: teamAdmin.id, teamId: teamA1.id, role: TeamRole.TEAM_ADMIN },
      ],
    });

    currentUser = author;
  });

  afterAll(async () => {
    await prisma.chatMessage.deleteMany({ where: { teamId: teamA1.id } });
    await prisma.club.deleteMany({
      where: { id: { in: [clubA.id, clubB.id] } },
    });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [author.id, teamAdmin.id, clubMemberOffTeam.id, outsider.id],
        },
      },
    });
    await app.close();
  });

  const messagesUrl = (): string =>
    `/clubs/${clubA.id}/teams/${teamA1.id}/messages`;

  interface MessageBody {
    id: string;
    content: string;
    author: { id: string } | null;
  }
  interface PageBody {
    messages: MessageBody[];
    nextCursor: string | null;
  }

  it('lets a team member post a message and read it back decrypted', async () => {
    const plaintext = 'Wer bringt am Samstag die Bälle mit?';

    const posted = await request(asUser(author))
      .post(messagesUrl())
      .send({ content: plaintext })
      .expect(201);

    const postedBody = posted.body as MessageBody;
    expect(postedBody.content).toBe(plaintext);
    expect(postedBody.author?.id).toBe(author.id);

    const listed = await request(asUser(author)).get(messagesUrl()).expect(200);
    const contents = (listed.body as PageBody).messages.map((m) => m.content);
    expect(contents).toContain(plaintext);
  });

  it('stores the message as ciphertext, not plaintext', async () => {
    const plaintext = `secret-${Date.now()}`;
    await request(asUser(author))
      .post(messagesUrl())
      .send({ content: plaintext })
      .expect(201);

    const row = await prisma.chatMessage.findFirstOrThrow({
      where: { teamId: teamA1.id, authorId: author.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(row.content).not.toBe(plaintext);
    expect(row.content).not.toContain(plaintext);
    expect(row.content.startsWith('v1:')).toBe(true);
  });

  it('rejects a message longer than 2000 chars with 400', async () => {
    await request(asUser(author))
      .post(messagesUrl())
      .send({ content: 'x'.repeat(2001) })
      .expect(400);
  });

  it('forbids a club member who is not on the team (403)', async () => {
    await request(asUser(clubMemberOffTeam)).get(messagesUrl()).expect(403);
    await request(asUser(clubMemberOffTeam))
      .post(messagesUrl())
      .send({ content: 'let me in' })
      .expect(403);
  });

  it('denies a member of a different club (403/404)', async () => {
    const res = await request(asUser(outsider)).get(messagesUrl());
    expect([403, 404]).toContain(res.status);
  });

  it('lets the author delete their own message (204)', async () => {
    const posted = await request(asUser(author))
      .post(messagesUrl())
      .send({ content: 'delete me' })
      .expect(201);
    const id = (posted.body as MessageBody).id;

    await request(asUser(author)).delete(`${messagesUrl()}/${id}`).expect(204);

    const gone = await prisma.chatMessage.findUnique({ where: { id } });
    expect(gone).toBeNull();
  });

  it("forbids a non-author member from deleting another's message (403)", async () => {
    const posted = await request(asUser(author))
      .post(messagesUrl())
      .send({ content: 'not yours' })
      .expect(201);
    const id = (posted.body as MessageBody).id;

    await request(asUser(clubMemberOffTeam))
      .delete(`${messagesUrl()}/${id}`)
      .expect(403);
  });

  it('lets a team admin delete any message (204)', async () => {
    const posted = await request(asUser(author))
      .post(messagesUrl())
      .send({ content: 'moderate me' })
      .expect(201);
    const id = (posted.body as MessageBody).id;

    await request(asUser(teamAdmin))
      .delete(`${messagesUrl()}/${id}`)
      .expect(204);

    const gone = await prisma.chatMessage.findUnique({ where: { id } });
    expect(gone).toBeNull();
  });
});
