import { Test, TestingModule } from '@nestjs/testing';
import type { User } from '../generated/prisma/client';
import { ClubRole, TeamRole } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toSubject } from './app-ability';
import { CaslAbilityFactory } from './casl-ability.factory';

describe('CaslAbilityFactory', () => {
  let factory: CaslAbilityFactory;

  const prismaMock = {
    clubMembership: { findMany: jest.fn() },
    teamMembership: { findMany: jest.fn() },
  };

  const makeUser = (overrides: Partial<User> = {}): User => ({
    id: 'user-1',
    auth0Sub: 'auth0|user-1',
    email: 'user@example.com',
    name: 'Test User',
    locale: 'de',
    isSuperAdmin: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const clubA = { id: 'club-a', name: 'Club A' };
  const clubB = { id: 'club-b', name: 'Club B' };
  const teamA1 = { id: 'team-a1', clubId: 'club-a' };
  const teamA2 = { id: 'team-a2', clubId: 'club-a' };
  const teamB1 = { id: 'team-b1', clubId: 'club-b' };

  beforeEach(async () => {
    jest.resetAllMocks();
    prismaMock.clubMembership.findMany.mockResolvedValue([]);
    prismaMock.teamMembership.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaslAbilityFactory,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    factory = module.get(CaslAbilityFactory);
  });

  describe('super admin', () => {
    it('can manage everything including creating clubs', async () => {
      const ability = await factory.createForUser(
        makeUser({ isSuperAdmin: true }),
      );

      expect(ability.can('manage', 'all')).toBe(true);
      expect(ability.can('create', 'Club')).toBe(true);
      expect(ability.can('delete', toSubject('Club', clubA))).toBe(true);
      expect(ability.can('update', toSubject('Team', teamB1))).toBe(true);
      expect(prismaMock.clubMembership.findMany).not.toHaveBeenCalled();
    });
  });

  describe('club admin of club A', () => {
    beforeEach(() => {
      prismaMock.clubMembership.findMany.mockResolvedValue([
        {
          id: 'cm-1',
          userId: 'user-1',
          clubId: 'club-a',
          role: ClubRole.CLUB_ADMIN,
        },
      ]);
    });

    it('cannot create or delete clubs', async () => {
      const ability = await factory.createForUser(makeUser());

      expect(ability.can('create', 'Club')).toBe(false);
      expect(ability.can('delete', toSubject('Club', clubA))).toBe(false);
    });

    it('can read and update club A but not club B', async () => {
      const ability = await factory.createForUser(makeUser());

      expect(ability.can('read', toSubject('Club', clubA))).toBe(true);
      expect(ability.can('update', toSubject('Club', clubA))).toBe(true);
      expect(ability.can('read', toSubject('Club', clubB))).toBe(false);
      expect(ability.can('update', toSubject('Club', clubB))).toBe(false);
    });

    it('can manage teams of club A but not of club B', async () => {
      const ability = await factory.createForUser(makeUser());

      expect(ability.can('create', toSubject('Team', teamA1))).toBe(true);
      expect(ability.can('update', toSubject('Team', teamA1))).toBe(true);
      expect(ability.can('delete', toSubject('Team', teamA1))).toBe(true);
      expect(ability.can('update', toSubject('Team', teamB1))).toBe(false);
    });

    it('can manage club and team memberships within club A only', async () => {
      const ability = await factory.createForUser(makeUser());

      const membershipA = { id: 'cm-2', clubId: 'club-a', userId: 'user-2' };
      const membershipB = { id: 'cm-3', clubId: 'club-b', userId: 'user-3' };
      expect(
        ability.can('create', toSubject('ClubMembership', membershipA)),
      ).toBe(true);
      expect(
        ability.can('update', toSubject('ClubMembership', membershipA)),
      ).toBe(true);
      expect(
        ability.can('delete', toSubject('ClubMembership', membershipA)),
      ).toBe(true);
      expect(
        ability.can('update', toSubject('ClubMembership', membershipB)),
      ).toBe(false);

      const teamMembershipA = {
        id: 'tm-1',
        teamId: 'team-a1',
        team: { clubId: 'club-a' },
      };
      const teamMembershipB = {
        id: 'tm-2',
        teamId: 'team-b1',
        team: { clubId: 'club-b' },
      };
      expect(
        ability.can('update', toSubject('TeamMembership', teamMembershipA)),
      ).toBe(true);
      expect(
        ability.can('update', toSubject('TeamMembership', teamMembershipB)),
      ).toBe(false);
    });
  });

  describe('member of club A', () => {
    beforeEach(() => {
      prismaMock.clubMembership.findMany.mockResolvedValue([
        {
          id: 'cm-1',
          userId: 'user-1',
          clubId: 'club-a',
          role: ClubRole.MEMBER,
        },
      ]);
    });

    it('can read club A, its teams and memberships', async () => {
      const ability = await factory.createForUser(makeUser());

      expect(ability.can('read', toSubject('Club', clubA))).toBe(true);
      expect(ability.can('read', toSubject('Team', teamA1))).toBe(true);
      expect(
        ability.can(
          'read',
          toSubject('ClubMembership', { id: 'cm-2', clubId: 'club-a' }),
        ),
      ).toBe(true);
      expect(
        ability.can(
          'read',
          toSubject('TeamMembership', {
            id: 'tm-1',
            teamId: 'team-a1',
            team: { clubId: 'club-a' },
          }),
        ),
      ).toBe(true);
    });

    it('cannot write anything in club A', async () => {
      const ability = await factory.createForUser(makeUser());

      expect(ability.can('update', toSubject('Club', clubA))).toBe(false);
      expect(ability.can('create', toSubject('Team', teamA1))).toBe(false);
      expect(ability.can('update', toSubject('Team', teamA1))).toBe(false);
      expect(
        ability.can(
          'create',
          toSubject('ClubMembership', { clubId: 'club-a', userId: 'user-2' }),
        ),
      ).toBe(false);
    });

    it('cannot read club B or its teams', async () => {
      const ability = await factory.createForUser(makeUser());

      expect(ability.can('read', toSubject('Club', clubB))).toBe(false);
      expect(ability.can('read', toSubject('Team', teamB1))).toBe(false);
    });
  });

  describe('team admin of team A1 (member of club A)', () => {
    beforeEach(() => {
      prismaMock.clubMembership.findMany.mockResolvedValue([
        {
          id: 'cm-1',
          userId: 'user-1',
          clubId: 'club-a',
          role: ClubRole.MEMBER,
        },
      ]);
      prismaMock.teamMembership.findMany.mockResolvedValue([
        {
          id: 'tm-1',
          userId: 'user-1',
          teamId: 'team-a1',
          role: TeamRole.TEAM_ADMIN,
        },
      ]);
    });

    it('can update team A1 but not create or delete teams', async () => {
      const ability = await factory.createForUser(makeUser());

      expect(ability.can('update', toSubject('Team', teamA1))).toBe(true);
      expect(ability.can('delete', toSubject('Team', teamA1))).toBe(false);
      expect(ability.can('create', toSubject('Team', teamA1))).toBe(false);
    });

    it('can only read the other teams of the club', async () => {
      const ability = await factory.createForUser(makeUser());

      expect(ability.can('read', toSubject('Team', teamA2))).toBe(true);
      expect(ability.can('update', toSubject('Team', teamA2))).toBe(false);
    });

    it('can manage memberships of team A1 only', async () => {
      const ability = await factory.createForUser(makeUser());

      const ownTeamMembership = {
        id: 'tm-2',
        teamId: 'team-a1',
        team: { clubId: 'club-a' },
      };
      const otherTeamMembership = {
        id: 'tm-3',
        teamId: 'team-a2',
        team: { clubId: 'club-a' },
      };
      expect(
        ability.can('create', toSubject('TeamMembership', ownTeamMembership)),
      ).toBe(true);
      expect(
        ability.can('update', toSubject('TeamMembership', ownTeamMembership)),
      ).toBe(true);
      expect(
        ability.can('delete', toSubject('TeamMembership', ownTeamMembership)),
      ).toBe(true);
      expect(
        ability.can('update', toSubject('TeamMembership', otherTeamMembership)),
      ).toBe(false);
    });
  });

  describe('player of team A1 (member of club A)', () => {
    beforeEach(() => {
      prismaMock.clubMembership.findMany.mockResolvedValue([
        {
          id: 'cm-1',
          userId: 'user-1',
          clubId: 'club-a',
          role: ClubRole.MEMBER,
        },
      ]);
      prismaMock.teamMembership.findMany.mockResolvedValue([
        {
          id: 'tm-1',
          userId: 'user-1',
          teamId: 'team-a1',
          role: TeamRole.PLAYER,
        },
      ]);
    });

    it('gets read access through the club membership only', async () => {
      const ability = await factory.createForUser(makeUser());

      expect(ability.can('read', toSubject('Team', teamA1))).toBe(true);
      expect(ability.can('update', toSubject('Team', teamA1))).toBe(false);
      expect(
        ability.can(
          'read',
          toSubject('TeamMembership', {
            id: 'tm-2',
            teamId: 'team-a1',
            team: { clubId: 'club-a' },
          }),
        ),
      ).toBe(true);
      expect(
        ability.can(
          'update',
          toSubject('TeamMembership', {
            id: 'tm-2',
            teamId: 'team-a1',
            team: { clubId: 'club-a' },
          }),
        ),
      ).toBe(false);
    });
  });

  describe('user without any memberships', () => {
    it('cannot read any club, team or membership', async () => {
      const ability = await factory.createForUser(makeUser());

      expect(ability.can('read', 'Club')).toBe(false);
      expect(ability.can('read', toSubject('Club', clubA))).toBe(false);
      expect(ability.can('read', toSubject('Team', teamA1))).toBe(false);
      expect(ability.can('create', 'Club')).toBe(false);
    });

    it('can still read and update their own profile', async () => {
      const ability = await factory.createForUser(makeUser());

      expect(ability.can('read', toSubject('User', { id: 'user-1' }))).toBe(
        true,
      );
      expect(ability.can('update', toSubject('User', { id: 'user-1' }))).toBe(
        true,
      );
      expect(ability.can('update', toSubject('User', { id: 'user-2' }))).toBe(
        false,
      );
    });
  });
});
