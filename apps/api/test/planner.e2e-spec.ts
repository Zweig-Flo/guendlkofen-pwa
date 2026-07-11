import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import passport, { Strategy } from 'passport';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  ClubRole,
  EventStatus,
  TeamRole,
  VoteChoice,
  type Club,
  type Event,
  type Team,
  type User,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(30000);

/** Kickoff a week out, so voting is open and the event is "upcoming". */
const future = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

type VotesBody = {
  summary: { yesCount: number; noCount: number };
  votes: { userId: string; choice: string }[];
};
type ImportBody = {
  imported: number;
  updated: number;
  skipped: number;
  errorCount: number;
  errors: unknown[];
};

describe('Planner (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let currentUser: User;

  let admin: User; // club admin of X + team admin of teamX1
  let player: User; // member of X + player of teamX1
  let outsider: User; // member of X, on no team

  let clubX: Club & { teams: Team[] };
  let clubY: Club & { teams: Team[] };
  let teamX1: Team;
  let teamX2: Team;
  let teamY1: Team;

  let eventX1: Event; // future event on teamX1
  let eventX2: Event; // future event on teamX2 (sibling team)
  let eventY1: Event; // event on clubY's team

  const unique = `planner-e2e-${Date.now()}`;

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

    const mkUser = (suffix: string, name: string) =>
      prisma.user.create({
        data: {
          auth0Sub: `test|${unique}-${suffix}`,
          email: `${unique}-${suffix}@example.com`,
          name,
        },
      });
    [admin, player, outsider] = await Promise.all([
      mkUser('admin', 'Club Admin'),
      mkUser('player', 'Team Player'),
      mkUser('outsider', 'Club Outsider'),
    ]);

    clubX = await prisma.club.create({
      data: {
        name: `${unique} Club X`,
        teams: {
          create: [
            { name: 'Herren 1', sport: 'Tennis', rank: 1 },
            { name: 'Herren 2', sport: 'Tennis', rank: 2 },
          ],
        },
        memberships: {
          create: [
            { userId: admin.id, role: ClubRole.CLUB_ADMIN },
            { userId: player.id, role: ClubRole.MEMBER },
            { userId: outsider.id, role: ClubRole.MEMBER },
          ],
        },
      },
      include: { teams: true },
    });
    teamX1 = clubX.teams.find((t) => t.rank === 1)!;
    teamX2 = clubX.teams.find((t) => t.rank === 2)!;

    await prisma.teamMembership.createMany({
      data: [
        { userId: admin.id, teamId: teamX1.id, role: TeamRole.TEAM_ADMIN },
        { userId: player.id, teamId: teamX1.id, role: TeamRole.PLAYER },
      ],
    });

    clubY = await prisma.club.create({
      data: {
        name: `${unique} Club Y`,
        teams: { create: { name: 'Damen 1', sport: 'Tennis', rank: 1 } },
      },
      include: { teams: true },
    });
    teamY1 = clubY.teams[0];

    [eventX1, eventX2, eventY1] = await Promise.all([
      prisma.event.create({
        data: { teamId: teamX1.id, startsAt: future(), opponent: 'Rival X1' },
      }),
      prisma.event.create({
        data: { teamId: teamX2.id, startsAt: future(), opponent: 'Rival X2' },
      }),
      prisma.event.create({
        data: { teamId: teamY1.id, startsAt: future(), opponent: 'Rival Y1' },
      }),
    ]);

    currentUser = player;
  });

  afterAll(async () => {
    await prisma.club.deleteMany({
      where: { id: { in: [clubX.id, clubY.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [admin.id, player.id, outsider.id] } },
    });
    await app.close();
  });

  const url = (clubId: string, teamId: string, path = '') =>
    `/clubs/${clubId}/teams/${teamId}/events${path}`;

  describe('vote permissions across teams and clubs', () => {
    it('lets a player vote on their own team event (200)', async () => {
      currentUser = player;
      await request(app.getHttpServer())
        .put(url(clubX.id, teamX1.id, `/${eventX1.id}/vote`))
        .send({ choice: VoteChoice.YES })
        .expect(200);
    });

    it('forbids voting on a sibling team the player is not on (403)', async () => {
      currentUser = player;
      await request(app.getHttpServer())
        .put(url(clubX.id, teamX2.id, `/${eventX2.id}/vote`))
        .send({ choice: VoteChoice.YES })
        .expect(403);
    });

    it('forbids a club member who is on no team from voting (403)', async () => {
      currentUser = outsider;
      await request(app.getHttpServer())
        .put(url(clubX.id, teamX1.id, `/${eventX1.id}/vote`))
        .send({ choice: VoteChoice.YES })
        .expect(403);
    });

    it('404s an event id that belongs to another team (out of scope)', async () => {
      currentUser = player;
      await request(app.getHttpServer())
        .put(url(clubX.id, teamX1.id, `/${eventY1.id}/vote`))
        .send({ choice: VoteChoice.YES })
        .expect(404);
    });

    it('denies a player access to another club entirely (403/404)', async () => {
      currentUser = player;
      const res = await request(app.getHttpServer())
        .put(url(clubY.id, teamY1.id, `/${eventY1.id}/vote`))
        .send({ choice: VoteChoice.YES });
      expect([403, 404]).toContain(res.status);
    });
  });

  describe('vote lifecycle + teammate visibility', () => {
    let eventId: string;

    it('team admin creates an event', async () => {
      currentUser = admin;
      const res = await request(app.getHttpServer())
        .post(url(clubX.id, teamX1.id))
        .send({ startsAt: future().toISOString(), opponent: 'Lifecycle FC' })
        .expect(201);
      eventId = (res.body as { id: string }).id;
      expect(
        (res.body as { summary: { notVotedCount: number } }).summary
          .notVotedCount,
      ).toBe(2); // admin + player are team members
    });

    it('player votes YES, then changes to NO — one row, tally updates', async () => {
      currentUser = player;
      await request(app.getHttpServer())
        .put(url(clubX.id, teamX1.id, `/${eventId}/vote`))
        .send({ choice: VoteChoice.YES })
        .expect(200)
        .expect((r) =>
          expect((r.body as { choice: string }).choice).toBe(VoteChoice.YES),
        );

      let votes = await request(app.getHttpServer())
        .get(url(clubX.id, teamX1.id, `/${eventId}/votes`))
        .expect(200);
      let body = votes.body as VotesBody;
      expect(body.summary.yesCount).toBe(1);
      expect(body.votes).toHaveLength(1);

      await request(app.getHttpServer())
        .put(url(clubX.id, teamX1.id, `/${eventId}/vote`))
        .send({ choice: VoteChoice.NO })
        .expect(200);

      votes = await request(app.getHttpServer())
        .get(url(clubX.id, teamX1.id, `/${eventId}/votes`))
        .expect(200);
      body = votes.body as VotesBody;
      expect(body.summary.yesCount).toBe(0);
      expect(body.summary.noCount).toBe(1);
    });

    it('a teammate can see the player vote (transparency)', async () => {
      currentUser = admin;
      const res = await request(app.getHttpServer())
        .get(url(clubX.id, teamX1.id, `/${eventId}/votes`))
        .expect(200);
      const mine = (res.body as VotesBody).votes.find(
        (v) => v.userId === player.id,
      );
      expect(mine?.choice).toBe(VoteChoice.NO);
    });

    it('cancelling the event closes voting (409)', async () => {
      currentUser = admin;
      await request(app.getHttpServer())
        .patch(url(clubX.id, teamX1.id, `/${eventId}`))
        .send({ status: EventStatus.CANCELLED })
        .expect(200);

      currentUser = player;
      await request(app.getHttpServer())
        .put(url(clubX.id, teamX1.id, `/${eventId}/vote`))
        .send({ choice: VoteChoice.YES })
        .expect(409);
    });
  });

  describe('GET /me/upcoming-events', () => {
    it('returns only the callers team events, with an embedded vote', async () => {
      currentUser = player;
      const res = await request(app.getHttpServer())
        .get('/me/upcoming-events')
        .expect(200);

      const events = res.body as {
        teamId: string;
        clubId: string;
        summary: Record<string, unknown>;
      }[];
      expect(events.length).toBeGreaterThan(0);
      // Every event belongs to a team the player is on (teamX1), never clubY.
      for (const e of events) {
        expect(e.teamId).toBe(teamX1.id);
        expect(e.clubId).toBe(clubX.id);
        expect(e.summary).toHaveProperty('myVote');
      }
    });
  });

  describe('CSV import', () => {
    const goodCsv = [
      'Datum;Zeit;Gegner;Ort;Heim/Auswärts;Notizen',
      '2026-09-12;15:00;Import Alpha;Sportplatz;Heim;Treffen 14:15',
      '19.09.2026;11:00;Import Beta;;A;',
      '2026-09-26;15:00;Import Gamma;;N;Trikot rot',
    ].join('\n');

    it('imports a valid CSV (happy path), idempotent on re-run', async () => {
      currentUser = admin;
      const first = await request(app.getHttpServer())
        .post(url(clubX.id, teamX1.id, '/import'))
        .attach('file', Buffer.from(goodCsv, 'utf8'), 'events.csv')
        .expect(200);
      expect(first.body).toMatchObject({
        imported: 3,
        updated: 0,
        skipped: 0,
        errorCount: 0,
      });

      // The imported events are queryable.
      const list = await request(app.getHttpServer())
        .get(url(clubX.id, teamX1.id))
        .query({ includePast: true })
        .expect(200);
      const opponents = (list.body as { opponent: string }[]).map(
        (e) => e.opponent,
      );
      expect(opponents).toEqual(
        expect.arrayContaining(['Import Alpha', 'Import Beta', 'Import Gamma']),
      );

      // Re-importing the identical file is a no-op.
      const second = await request(app.getHttpServer())
        .post(url(clubX.id, teamX1.id, '/import'))
        .attach('file', Buffer.from(goodCsv, 'utf8'), 'events.csv')
        .expect(200);
      expect(second.body).toMatchObject({ imported: 0, skipped: 3 });
    });

    it('partial success: reports bad rows, imports the valid ones (200)', async () => {
      currentUser = admin;
      const csv = [
        'Datum;Zeit;Gegner',
        '2026-13-40;15:00;Bad Date FC',
        '2026-09-12;11:00;',
        '2026-10-03;15:00;Malformed OK',
      ].join('\n');
      const res = await request(app.getHttpServer())
        .post(url(clubX.id, teamX1.id, '/import'))
        .attach('file', Buffer.from(csv, 'utf8'), 'events.csv')
        .expect(200);
      const body = res.body as ImportBody;
      expect(body.errorCount).toBe(2);
      expect(body.errors).toHaveLength(2);
      expect(body.imported).toBe(1);
    });

    it('rejects a file missing a required header (400)', async () => {
      currentUser = admin;
      const csv = ['Datum;Gegner', '2026-09-12;No Time FC'].join('\n');
      await request(app.getHttpServer())
        .post(url(clubX.id, teamX1.id, '/import'))
        .attach('file', Buffer.from(csv, 'utf8'), 'events.csv')
        .expect(400);
    });

    it('rejects an oversized file (413)', async () => {
      currentUser = admin;
      await request(app.getHttpServer())
        .post(url(clubX.id, teamX1.id, '/import'))
        .attach('file', Buffer.alloc(2_000_000, 'x'), 'big.csv')
        .expect(413);
    });

    it('forbids a non-admin from importing (403)', async () => {
      currentUser = player;
      await request(app.getHttpServer())
        .post(url(clubX.id, teamX1.id, '/import'))
        .attach('file', Buffer.from(goodCsv, 'utf8'), 'events.csv')
        .expect(403);
    });
  });
});
