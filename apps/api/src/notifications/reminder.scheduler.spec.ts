import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  EventStatus,
  Prisma,
  ReminderKind,
  VoteChoice,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { ReminderScheduler } from './reminder.scheduler';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-12T10:00:00.000Z');

const USER_ID = 'user-1';

/** Builds an event-with-includes shaped like the scheduler's findMany result. */
function makeEvent(opts: {
  daysOut: number;
  vote?: VoteChoice;
  reminderKinds?: ReminderKind[];
  userId?: string;
  locale?: string;
}) {
  const userId = opts.userId ?? USER_ID;
  return {
    id: 'event-1',
    teamId: 'team-1',
    startsAt: new Date(NOW.getTime() + opts.daysOut * DAY_MS),
    opponent: 'SV Musterhausen',
    location: null,
    homeAway: 'HOME',
    notes: null,
    status: EventStatus.SCHEDULED,
    source: 'MANUAL',
    importKey: null,
    createdAt: NOW,
    updatedAt: NOW,
    team: {
      id: 'team-1',
      clubId: 'club-1',
      name: 'Herren 1',
      club: { id: 'club-1', name: 'SV Gündlkofen' },
      memberships: [
        {
          userId,
          user: {
            id: userId,
            email: 'a@example.com',
            locale: opts.locale ?? 'de',
          },
        },
      ],
    },
    votes: opts.vote ? [{ userId, choice: opts.vote }] : [],
    reminderLogs: (opts.reminderKinds ?? []).map((kind) => ({ userId, kind })),
  };
}

describe('ReminderScheduler', () => {
  let scheduler: ReminderScheduler;

  const prismaMock = {
    event: { findMany: jest.fn() },
    reminderLog: { create: jest.fn() },
  };
  const notificationsMock = { notify: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    prismaMock.reminderLog.create.mockResolvedValue({});
    notificationsMock.notify.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReminderScheduler,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: notificationsMock },
        {
          provide: ConfigService,
          useValue: { get: () => 'https://app.guendlkofen.test' },
        },
      ],
    }).compile();
    scheduler = module.get(ReminderScheduler);
  });

  function sentKinds(): ReminderKind[] {
    const calls = notificationsMock.notify.mock.calls as Array<
      [unknown, { kind: ReminderKind }]
    >;
    return calls.map((call) => call[1].kind);
  }

  it('sends VOTE_7D (only) for a non-voter on an event 5 days out', async () => {
    prismaMock.event.findMany.mockResolvedValue([makeEvent({ daysOut: 5 })]);

    const dispatched = await scheduler.tick(NOW);

    expect(dispatched).toBe(1);
    expect(sentKinds()).toEqual([ReminderKind.VOTE_7D]);
  });

  it('sends VOTE_2D for a non-voter inside 2d when VOTE_7D was already logged', async () => {
    prismaMock.event.findMany.mockResolvedValue([
      makeEvent({ daysOut: 1.5, reminderKinds: [ReminderKind.VOTE_7D] }),
    ]);

    const dispatched = await scheduler.tick(NOW);

    expect(dispatched).toBe(1);
    expect(sentKinds()).toEqual([ReminderKind.VOTE_2D]);
  });

  it('sends INFO_1D to a YES voter within 1 day (no vote nudges)', async () => {
    prismaMock.event.findMany.mockResolvedValue([
      makeEvent({ daysOut: 0.5, vote: VoteChoice.YES }),
    ]);

    const dispatched = await scheduler.tick(NOW);

    expect(dispatched).toBe(1);
    expect(sentKinds()).toEqual([ReminderKind.INFO_1D]);
  });

  it('never reminds a NO voter', async () => {
    prismaMock.event.findMany.mockResolvedValue([
      makeEvent({ daysOut: 0.5, vote: VoteChoice.NO }),
    ]);

    const dispatched = await scheduler.tick(NOW);

    expect(dispatched).toBe(0);
    expect(notificationsMock.notify).not.toHaveBeenCalled();
  });

  it('does not re-send when a reminder is already logged in this window', async () => {
    prismaMock.event.findMany.mockResolvedValue([
      makeEvent({ daysOut: 5, reminderKinds: [ReminderKind.VOTE_7D] }),
    ]);

    const dispatched = await scheduler.tick(NOW);

    expect(dispatched).toBe(0);
    expect(prismaMock.reminderLog.create).not.toHaveBeenCalled();
    expect(notificationsMock.notify).not.toHaveBeenCalled();
  });

  it('dedupes concurrently: a P2002 on the log claim skips the send', async () => {
    prismaMock.event.findMany.mockResolvedValue([makeEvent({ daysOut: 5 })]);
    prismaMock.reminderLog.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const dispatched = await scheduler.tick(NOW);

    expect(dispatched).toBe(0);
    expect(notificationsMock.notify).not.toHaveBeenCalled();
  });

  it('passes the deep-link URL and event context to notify', async () => {
    prismaMock.event.findMany.mockResolvedValue([makeEvent({ daysOut: 5 })]);

    await scheduler.tick(NOW);

    expect(notificationsMock.notify).toHaveBeenCalledWith(
      expect.objectContaining({ id: USER_ID }),
      expect.objectContaining({
        kind: ReminderKind.VOTE_7D,
        clubName: 'SV Gündlkofen',
        teamName: 'Herren 1',
        opponent: 'SV Musterhausen',
        url: 'https://app.guendlkofen.test/clubs/club-1/teams/team-1/events/event-1',
      }),
    );
  });
});
