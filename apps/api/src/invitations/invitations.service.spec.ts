import { BadRequestException, GoneException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AbilityBuilder } from '@casl/ability';
import { createPrismaAbility } from '@casl/prisma/runtime';
import type { AppAbility } from '../casl/app-ability';
import { ClubsService } from '../clubs/clubs.service';
import { EmailService } from '../email/email.service';
import {
  ClubRole,
  InvitationStatus,
  TeamRole,
} from '../generated/prisma/client';
import type { User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InvitationDto } from './dto/invitation.dto';
import { InvitationsService } from './invitations.service';

const CLUB_ID = 'club-a';

/** An ability that lets the holder manage invitations of club-a. */
function clubAdminAbility(): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createPrismaAbility);
  can('manage', 'Invitation', { clubId: { in: [CLUB_ID] } });
  return build();
}

function makeInviter(overrides: Partial<User> = {}): User {
  return {
    id: 'inviter-1',
    auth0Sub: 'auth0|inviter',
    email: 'admin@example.com',
    name: 'Admin',
    locale: 'de',
    isSuperAdmin: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeInvitationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    clubId: CLUB_ID,
    email: 'newplayer@example.com',
    clubRole: ClubRole.MEMBER,
    token: 'secret-token',
    status: InvitationStatus.PENDING,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    invitedById: 'inviter-1',
    acceptedById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    club: { id: CLUB_ID, name: 'Club A' },
    invitedBy: makeInviter(),
    teamAssignments: [],
    ...overrides,
  };
}

describe('InvitationsService', () => {
  let service: InvitationsService;

  const prismaMock = {
    invitation: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    team: { findMany: jest.fn() },
    clubMembership: { findUnique: jest.fn(), upsert: jest.fn() },
    teamMembership: { findUnique: jest.fn(), upsert: jest.fn() },
    $transaction: jest.fn(),
  };

  const clubsServiceMock = { getClubForAbility: jest.fn() };
  const emailServiceMock = { send: jest.fn() };
  const configMock = { get: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    clubsServiceMock.getClubForAbility.mockResolvedValue({
      id: CLUB_ID,
      name: 'Club A',
    });
    configMock.get.mockReturnValue(undefined);
    emailServiceMock.send.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitationsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ClubsService, useValue: clubsServiceMock },
        { provide: EmailService, useValue: emailServiceMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get(InvitationsService);
  });

  describe('create', () => {
    it('revokes an existing PENDING invitation before creating a new one', async () => {
      prismaMock.team.findMany.mockResolvedValue([]);
      const created = makeInvitationRow();
      const tx = {
        invitation: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: jest.fn().mockResolvedValue(created),
        },
      };
      prismaMock.$transaction.mockImplementation(
        (cb: (t: typeof tx) => unknown) => cb(tx),
      );

      const result = await service.create(
        clubAdminAbility(),
        CLUB_ID,
        { email: 'newplayer@example.com', clubRole: ClubRole.MEMBER },
        makeInviter(),
      );

      expect(tx.invitation.updateMany).toHaveBeenCalledWith({
        where: {
          clubId: CLUB_ID,
          email: 'newplayer@example.com',
          status: InvitationStatus.PENDING,
        },
        data: { status: InvitationStatus.REVOKED },
      });
      expect(tx.invitation.create).toHaveBeenCalled();
      expect(result.id).toBe('inv-1');
    });

    it('rejects a teamId that belongs to another club with 400', async () => {
      // The queried team (scoped to the club) is not found -> foreign.
      prismaMock.team.findMany.mockResolvedValue([]);

      await expect(
        service.create(
          clubAdminAbility(),
          CLUB_ID,
          {
            email: 'newplayer@example.com',
            clubRole: ClubRole.MEMBER,
            teamAssignments: [
              { teamId: 'team-of-club-b', role: TeamRole.PLAYER },
            ],
          },
          makeInviter(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('still returns the invitation when the email send fails', async () => {
      prismaMock.team.findMany.mockResolvedValue([]);
      const created = makeInvitationRow();
      const tx = {
        invitation: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: jest.fn().mockResolvedValue(created),
        },
      };
      prismaMock.$transaction.mockImplementation(
        (cb: (t: typeof tx) => unknown) => cb(tx),
      );
      emailServiceMock.send.mockRejectedValue(new Error('smtp down'));

      const result = await service.create(
        clubAdminAbility(),
        CLUB_ID,
        { email: 'newplayer@example.com', clubRole: ClubRole.MEMBER },
        makeInviter(),
      );

      expect(result.id).toBe('inv-1');
    });

    it('never exposes the token in the response DTO', async () => {
      prismaMock.team.findMany.mockResolvedValue([]);
      const created = makeInvitationRow({ token: 'super-secret' });
      const tx = {
        invitation: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: jest.fn().mockResolvedValue(created),
        },
      };
      prismaMock.$transaction.mockImplementation(
        (cb: (t: typeof tx) => unknown) => cb(tx),
      );

      const invitation = await service.create(
        clubAdminAbility(),
        CLUB_ID,
        { email: 'newplayer@example.com', clubRole: ClubRole.MEMBER },
        makeInviter(),
      );
      const dto = InvitationDto.fromInvitation(invitation);
      const serialized = JSON.stringify(dto);

      expect(serialized).not.toContain('super-secret');
      expect(Object.keys(dto)).not.toContain('token');
    });
  });

  describe('redeem', () => {
    it('rejects an expired invitation with 410 Gone', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(
        makeInvitationRow({
          expiresAt: new Date(Date.now() - 1000),
          teamAssignments: [],
        }),
      );

      await expect(
        service.redeem(makeInviter({ id: 'redeemer' }), 'secret-token'),
      ).rejects.toBeInstanceOf(GoneException);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an already-accepted invitation with 410 Gone', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(
        makeInvitationRow({ status: InvitationStatus.ACCEPTED }),
      );

      await expect(
        service.redeem(makeInviter({ id: 'redeemer' }), 'secret-token'),
      ).rejects.toBeInstanceOf(GoneException);
    });

    it('keeps the higher club role when the user is already a CLUB_ADMIN', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(
        makeInvitationRow({ clubRole: ClubRole.MEMBER, teamAssignments: [] }),
      );
      const tx = {
        clubMembership: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ role: ClubRole.CLUB_ADMIN }),
          upsert: jest.fn().mockResolvedValue({
            id: 'cm-1',
            clubId: CLUB_ID,
            userId: 'redeemer',
            role: ClubRole.CLUB_ADMIN,
            user: makeInviter({ id: 'redeemer' }),
          }),
        },
        teamMembership: { findUnique: jest.fn(), upsert: jest.fn() },
        invitation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      };
      prismaMock.$transaction.mockImplementation(
        (cb: (t: typeof tx) => unknown) => cb(tx),
      );

      await service.redeem(makeInviter({ id: 'redeemer' }), 'secret-token');

      expect(tx.clubMembership.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: {
            userId: 'redeemer',
            clubId: CLUB_ID,
            role: ClubRole.CLUB_ADMIN,
          },
          update: { role: ClubRole.CLUB_ADMIN },
        }),
      );
    });

    it('upgrades a MEMBER to CLUB_ADMIN when the invitation grants CLUB_ADMIN', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(
        makeInvitationRow({
          clubRole: ClubRole.CLUB_ADMIN,
          teamAssignments: [{ teamId: 'team-1', role: TeamRole.PLAYER }],
        }),
      );
      const tx = {
        clubMembership: {
          findUnique: jest.fn().mockResolvedValue({ role: ClubRole.MEMBER }),
          upsert: jest.fn().mockResolvedValue({
            id: 'cm-1',
            clubId: CLUB_ID,
            userId: 'redeemer',
            role: ClubRole.CLUB_ADMIN,
            user: makeInviter({ id: 'redeemer' }),
          }),
        },
        teamMembership: {
          // Existing TEAM_ADMIN must be preserved.
          findUnique: jest
            .fn()
            .mockResolvedValue({ role: TeamRole.TEAM_ADMIN }),
          upsert: jest.fn().mockResolvedValue({}),
        },
        invitation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      };
      prismaMock.$transaction.mockImplementation(
        (cb: (t: typeof tx) => unknown) => cb(tx),
      );

      await service.redeem(makeInviter({ id: 'redeemer' }), 'secret-token');

      expect(tx.clubMembership.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { role: ClubRole.CLUB_ADMIN },
        }),
      );
      expect(tx.teamMembership.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { role: TeamRole.TEAM_ADMIN },
        }),
      );
      expect(tx.invitation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: InvitationStatus.ACCEPTED,
            acceptedById: 'redeemer',
          },
        }),
      );
    });

    it('throws 410 when another redeem claims the invitation concurrently', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(makeInvitationRow({}));
      const tx = {
        clubMembership: { findUnique: jest.fn(), upsert: jest.fn() },
        teamMembership: { findUnique: jest.fn(), upsert: jest.fn() },
        // The conditional claim matched no PENDING row — someone was faster.
        invitation: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      };
      prismaMock.$transaction.mockImplementation(
        (cb: (t: typeof tx) => unknown) => cb(tx),
      );

      await expect(
        service.redeem(makeInviter({ id: 'redeemer' }), 'secret-token'),
      ).rejects.toBeInstanceOf(GoneException);
      expect(tx.clubMembership.upsert).not.toHaveBeenCalled();
    });
  });
});
