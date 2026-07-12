import { ConfigService } from '@nestjs/config';
import {
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { CaslAbilityFactory } from '../casl/casl-ability.factory';
import type { AppAbility } from '../casl/app-ability';
import {
  ClubRole,
  TeamRole,
  type ChatMessage,
  type Team,
  type User,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TeamsService } from '../teams/teams.service';
import { ChatCryptoService } from './chat-crypto.service';
import { ChatEvents } from './chat-events';
import { ChatService } from './chat.service';

const TEAM: Team = {
  id: 'team-a1',
  clubId: 'club-a',
  name: 'Herren 1',
  sport: 'Tennis',
  league: null,
  rank: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    auth0Sub: 'auth0|1',
    email: 'player@example.com',
    name: 'Player One',
    locale: 'de',
    isSuperAdmin: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Builds a real AppAbility for the given memberships (production rules). */
async function abilityFor(
  clubMemberships: Array<{ clubId: string; role: ClubRole }>,
  teamMemberships: Array<{ teamId: string; role: TeamRole }>,
): Promise<AppAbility> {
  const prismaMock = {
    clubMembership: { findMany: jest.fn().mockResolvedValue(clubMemberships) },
    teamMembership: { findMany: jest.fn().mockResolvedValue(teamMemberships) },
  } as unknown as PrismaService;
  const factory = new CaslAbilityFactory(prismaMock);
  return factory.createForUser(makeUser());
}

const PLAYER = () =>
  abilityFor(
    [{ clubId: 'club-a', role: ClubRole.MEMBER }],
    [{ teamId: 'team-a1', role: TeamRole.PLAYER }],
  );
const TEAM_ADMIN = () =>
  abilityFor(
    [{ clubId: 'club-a', role: ClubRole.MEMBER }],
    [{ teamId: 'team-a1', role: TeamRole.TEAM_ADMIN }],
  );
const CLUB_ADMIN = () =>
  abilityFor([{ clubId: 'club-a', role: ClubRole.CLUB_ADMIN }], []);
const OUTSIDER = () => abilityFor([], []);

describe('ChatService', () => {
  let service: ChatService;
  let prisma: {
    chatMessage: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      delete: jest.Mock;
    };
    teamMembership: { findMany: jest.Mock };
  };
  let teams: { getTeamInClubForAbility: jest.Mock };
  let crypto: { encrypt: jest.Mock; decrypt: jest.Mock };
  let events: {
    emitMessage: jest.Mock;
    emitDeleted: jest.Mock;
    isUserInRoom: jest.Mock;
  };
  let notifications: { sendPushOnly: jest.Mock };

  const user = makeUser();

  const makeMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
    id: 'msg-1',
    teamId: TEAM.id,
    authorId: user.id,
    content: 'v1:cipher',
    createdAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      chatMessage: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue(undefined),
      },
      teamMembership: { findMany: jest.fn().mockResolvedValue([]) },
    };
    teams = { getTeamInClubForAbility: jest.fn().mockResolvedValue(TEAM) };
    crypto = {
      encrypt: jest.fn().mockReturnValue('v1:cipher'),
      decrypt: jest.fn().mockReturnValue('decrypted'),
    };
    events = {
      emitMessage: jest.fn(),
      emitDeleted: jest.fn(),
      isUserInRoom: jest.fn().mockReturnValue(false),
    };
    notifications = { sendPushOnly: jest.fn().mockResolvedValue(undefined) };
    const config = {
      get: jest.fn().mockReturnValue('http://web.test'),
    } as unknown as ConfigService;

    service = new ChatService(
      prisma as unknown as PrismaService,
      teams as unknown as TeamsService,
      crypto as unknown as ChatCryptoService,
      events as unknown as ChatEvents,
      notifications as unknown as NotificationsService,
      config,
    );
  });

  describe('send', () => {
    it('encrypts, persists ciphertext, emits and returns decrypted content', async () => {
      prisma.chatMessage.create.mockResolvedValue(
        makeMessage({ author: { ...user } } as Partial<ChatMessage>),
      );
      const ability = await PLAYER();

      const dto = await service.send(ability, 'club-a', 'team-a1', user, {
        content: 'hello team',
      });

      expect(crypto.encrypt).toHaveBeenCalledWith('hello team');
      const createCalls = prisma.chatMessage.create.mock.calls as Array<
        [{ data: { content: string } }]
      >;
      expect(createCalls[0][0].data.content).toBe('v1:cipher');
      expect(dto.content).toBe('hello team');
      expect(events.emitMessage).toHaveBeenCalledWith('team-a1', dto);
    });

    it('forbids a non-member from sending', async () => {
      const ability = await OUTSIDER();
      await expect(
        service.send(ability, 'club-a', 'team-a1', user, { content: 'hi' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    });

    it('enforces the flood limit (11th message in the window is 429)', async () => {
      prisma.chatMessage.create.mockResolvedValue(
        makeMessage({ author: { ...user } } as Partial<ChatMessage>),
      );
      const ability = await PLAYER();

      for (let i = 0; i < 10; i++) {
        await service.send(ability, 'club-a', 'team-a1', user, {
          content: `m${i}`,
        });
      }
      await expect(
        service.send(ability, 'club-a', 'team-a1', user, { content: 'flood' }),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('pushes only to offline members, skipping the author and online users', async () => {
      prisma.chatMessage.create.mockResolvedValue(
        makeMessage({ author: { ...user } } as Partial<ChatMessage>),
      );
      const online = makeUser({ id: 'user-2', name: 'Online' });
      const offline = makeUser({ id: 'user-3', name: 'Offline' });
      prisma.teamMembership.findMany.mockResolvedValue([
        { user },
        { user: online },
        { user: offline },
      ]);
      events.isUserInRoom.mockImplementation(
        (_teamId: string, userId: string) => userId === 'user-2',
      );
      const ability = await PLAYER();

      await service.send(ability, 'club-a', 'team-a1', user, {
        content: 'ping',
      });

      expect(notifications.sendPushOnly).toHaveBeenCalledTimes(1);
      const [pushedUser] = notifications.sendPushOnly.mock.calls[0] as [User];
      expect(pushedUser.id).toBe('user-3');
    });
  });

  describe('remove (permission matrix)', () => {
    it('lets the author delete their own message', async () => {
      prisma.chatMessage.findFirst.mockResolvedValue(
        makeMessage({ authorId: user.id }),
      );
      const ability = await PLAYER();

      await service.remove(ability, 'club-a', 'team-a1', 'msg-1');

      expect(prisma.chatMessage.delete).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
      });
      expect(events.emitDeleted).toHaveBeenCalledWith('team-a1', 'msg-1');
    });

    it("forbids a member from deleting someone else's message", async () => {
      prisma.chatMessage.findFirst.mockResolvedValue(
        makeMessage({ authorId: 'someone-else' }),
      );
      const ability = await PLAYER();

      await expect(
        service.remove(ability, 'club-a', 'team-a1', 'msg-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.chatMessage.delete).not.toHaveBeenCalled();
    });

    it('lets a team admin delete any message', async () => {
      prisma.chatMessage.findFirst.mockResolvedValue(
        makeMessage({ authorId: 'someone-else' }),
      );
      const ability = await TEAM_ADMIN();

      await service.remove(ability, 'club-a', 'team-a1', 'msg-1');
      expect(prisma.chatMessage.delete).toHaveBeenCalled();
    });

    it('lets a club admin delete any message in their club', async () => {
      prisma.chatMessage.findFirst.mockResolvedValue(
        makeMessage({ authorId: 'someone-else' }),
      );
      const ability = await CLUB_ADMIN();

      await service.remove(ability, 'club-a', 'team-a1', 'msg-1');
      expect(prisma.chatMessage.delete).toHaveBeenCalled();
    });

    it('404s when the message is not in the team', async () => {
      prisma.chatMessage.findFirst.mockResolvedValue(null);
      const ability = await TEAM_ADMIN();

      await expect(
        service.remove(ability, 'club-a', 'team-a1', 'missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('decrypts each message and returns a nextCursor when full', async () => {
      const rows = Array.from({ length: 2 }, (_, i) =>
        makeMessage({
          id: `m${i}`,
          author: { ...user },
        } as Partial<ChatMessage>),
      );
      prisma.chatMessage.findMany.mockResolvedValue(rows);
      const ability = await PLAYER();

      const page = await service.list(
        ability,
        'club-a',
        'team-a1',
        undefined,
        2,
      );

      expect(crypto.decrypt).toHaveBeenCalledTimes(2);
      expect(page.messages).toHaveLength(2);
      expect(page.messages[0].content).toBe('decrypted');
      expect(page.nextCursor).toBe('m1');
    });

    it('forbids a non-member from listing', async () => {
      const ability = await OUTSIDER();
      await expect(
        service.list(ability, 'club-a', 'team-a1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
