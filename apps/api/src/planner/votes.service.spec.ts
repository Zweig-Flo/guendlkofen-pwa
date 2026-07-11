import { AbilityBuilder } from '@casl/ability';
import { createPrismaAbility } from '@casl/prisma/runtime';
import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { AppAbility } from '../casl/app-ability';
import {
  EventStatus,
  VoteChoice,
  type Event,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from './events.service';
import { VotesService } from './votes.service';

const CLUB_ID = 'club-a';
const TEAM_ID = 'team-a1';
const EVENT_ID = 'event-1';
const USER_ID = 'user-1';

/** A player who may manage their own vote row. */
function playerAbility(): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createPrismaAbility);
  can('vote', 'Event', { teamId: { in: [TEAM_ID] } });
  can('read', 'Event', { teamId: { in: [TEAM_ID] } });
  can('read', 'Vote', { event: { is: { teamId: { in: [TEAM_ID] } } } });
  can('manage', 'Vote', { userId: USER_ID });
  return build();
}

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: EVENT_ID,
    teamId: TEAM_ID,
    startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
    opponent: 'SV Musterhausen',
    location: null,
    homeAway: 'HOME',
    notes: null,
    status: EventStatus.SCHEDULED,
    source: 'MANUAL',
    importKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('VotesService', () => {
  let service: VotesService;

  const prismaMock = {
    vote: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
    teamMembership: { count: jest.fn() },
  };

  const eventsServiceMock = {
    getEventInTeamForAbility: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VotesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EventsService, useValue: eventsServiceMock },
      ],
    }).compile();
    service = module.get(VotesService);
  });

  describe('castVote', () => {
    it('upserts a single row: create on first cast, update on change', async () => {
      eventsServiceMock.getEventInTeamForAbility.mockResolvedValue(makeEvent());
      prismaMock.vote.upsert.mockImplementation(
        (args: { create: { choice: VoteChoice } }) =>
          Promise.resolve({
            id: 'vote-1',
            eventId: EVENT_ID,
            userId: USER_ID,
            choice: args.create.choice,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
      );

      await service.castVote(
        playerAbility(),
        CLUB_ID,
        TEAM_ID,
        EVENT_ID,
        USER_ID,
        {
          choice: VoteChoice.YES,
        },
      );
      await service.castVote(
        playerAbility(),
        CLUB_ID,
        TEAM_ID,
        EVENT_ID,
        USER_ID,
        {
          choice: VoteChoice.NO,
        },
      );

      expect(prismaMock.vote.upsert).toHaveBeenCalledTimes(2);
      // Upserts on the (eventId, userId) unique key — never a second row.
      expect(prismaMock.vote.upsert).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { eventId_userId: { eventId: EVENT_ID, userId: USER_ID } },
          update: { choice: VoteChoice.NO },
        }),
      );
    });

    it('rejects a vote after kickoff with 409', async () => {
      eventsServiceMock.getEventInTeamForAbility.mockResolvedValue(
        makeEvent({ startsAt: new Date(Date.now() - 60_000) }),
      );

      await expect(
        service.castVote(playerAbility(), CLUB_ID, TEAM_ID, EVENT_ID, USER_ID, {
          choice: VoteChoice.YES,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prismaMock.vote.upsert).not.toHaveBeenCalled();
    });

    it('rejects a vote on a cancelled event with 409', async () => {
      eventsServiceMock.getEventInTeamForAbility.mockResolvedValue(
        makeEvent({ status: EventStatus.CANCELLED }),
      );

      await expect(
        service.castVote(playerAbility(), CLUB_ID, TEAM_ID, EVENT_ID, USER_ID, {
          choice: VoteChoice.YES,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prismaMock.vote.upsert).not.toHaveBeenCalled();
    });
  });

  describe('retractVote', () => {
    it('deletes the caller vote row while voting is open', async () => {
      eventsServiceMock.getEventInTeamForAbility.mockResolvedValue(makeEvent());
      prismaMock.vote.deleteMany.mockResolvedValue({ count: 1 });

      await service.retractVote(
        playerAbility(),
        CLUB_ID,
        TEAM_ID,
        EVENT_ID,
        USER_ID,
      );

      expect(prismaMock.vote.deleteMany).toHaveBeenCalledWith({
        where: { eventId: EVENT_ID, userId: USER_ID },
      });
    });

    it('rejects retract after kickoff with 409', async () => {
      eventsServiceMock.getEventInTeamForAbility.mockResolvedValue(
        makeEvent({ startsAt: new Date(Date.now() - 60_000) }),
      );

      await expect(
        service.retractVote(
          playerAbility(),
          CLUB_ID,
          TEAM_ID,
          EVENT_ID,
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prismaMock.vote.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('listVotes', () => {
    it('computes notVotedCount against the team size', async () => {
      eventsServiceMock.getEventInTeamForAbility.mockResolvedValue(makeEvent());
      prismaMock.vote.findMany.mockResolvedValue([
        { userId: 'user-1', choice: VoteChoice.YES, user: { name: 'A' } },
        { userId: 'user-2', choice: VoteChoice.YES, user: { name: 'B' } },
        { userId: 'user-3', choice: VoteChoice.NO, user: { name: 'C' } },
      ]);
      prismaMock.teamMembership.count.mockResolvedValue(5);

      const result = await service.listVotes(
        playerAbility(),
        CLUB_ID,
        TEAM_ID,
        EVENT_ID,
        USER_ID,
      );

      expect(result.summary.yesCount).toBe(2);
      expect(result.summary.noCount).toBe(1);
      expect(result.summary.notVotedCount).toBe(2); // 5 - (2 + 1)
      expect(result.summary.myVote).toBe(VoteChoice.YES);
      expect(result.votes).toHaveLength(3);
      expect(result.votes[0]).toMatchObject({
        userId: 'user-1',
        userName: 'A',
      });
    });
  });
});
