import { randomBytes } from 'node:crypto';
import { accessibleBy } from '@casl/prisma/runtime';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type AppAbility, toSubject } from '../casl/app-ability';
import { ClubsService } from '../clubs/clubs.service';
import { EmailService } from '../email/email.service';
import { buildInvitationEmail } from '../email/invitation-email';
import type {
  Club,
  ClubMembership,
  Invitation,
  InvitationTeamAssignment,
  Team,
  User,
} from '../generated/prisma/client';
import {
  ClubRole,
  InvitationStatus,
  TeamRole,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateInvitationDto } from './dto/create-invitation.dto';
import type { InvitationPreviewStatus } from './dto/invitation-preview.dto';

const INVITATION_TTL_DAYS = 14;

export type InvitationWithRelations = Invitation & {
  club: Club;
  // Nullable: the inviter relation is `onDelete: SetNull`, so the invitation
  // audit trail survives inviter deletion. The InvitationDto handles null.
  invitedBy: User | null;
  teamAssignments: (InvitationTeamAssignment & { team: Team })[];
};

type ClubMembershipWithUser = ClubMembership & { user: User };

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clubsService: ClubsService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  private static readonly relationInclude = {
    club: true,
    invitedBy: true,
    teamAssignments: { include: { team: true } },
  } as const;

  async findAllInClub(
    ability: AppAbility,
    clubId: string,
  ): Promise<InvitationWithRelations[]> {
    await this.clubsService.getClubForAbility(ability, clubId, 'read');
    // Scoped by the URL's clubId AND by CASL — isolation lives in the query.
    return this.prisma.invitation.findMany({
      where: {
        AND: [{ clubId }, accessibleBy(ability, 'read').ofType('Invitation')],
      },
      include: InvitationsService.relationInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    ability: AppAbility,
    clubId: string,
    dto: CreateInvitationDto,
    inviter: User,
  ): Promise<InvitationWithRelations> {
    await this.clubsService.getClubForAbility(ability, clubId, 'read');
    if (ability.cannot('create', toSubject('Invitation', { clubId }))) {
      throw new ForbiddenException(
        'You are not allowed to invite people to this club',
      );
    }

    // De-duplicate assignments per team, then check they all belong to the club.
    const assignments = this.dedupeAssignments(dto.teamAssignments ?? []);
    if (assignments.length > 0) {
      const teamIds = assignments.map((a) => a.teamId);
      const teams = await this.prisma.team.findMany({
        where: { id: { in: teamIds }, clubId },
        select: { id: true },
      });
      const found = new Set(teams.map((t) => t.id));
      const foreign = teamIds.filter((id) => !found.has(id));
      if (foreign.length > 0) {
        throw new BadRequestException(
          `These teams do not belong to this club: ${foreign.join(', ')}`,
        );
      }
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    const invitation = await this.prisma.$transaction(async (tx) => {
      // Supersede any still-pending invitation for the same club + email.
      await tx.invitation.updateMany({
        where: { clubId, email: dto.email, status: InvitationStatus.PENDING },
        data: { status: InvitationStatus.REVOKED },
      });
      return tx.invitation.create({
        data: {
          clubId,
          email: dto.email,
          clubRole: dto.clubRole,
          token,
          expiresAt,
          invitedById: inviter.id,
          teamAssignments: {
            create: assignments.map((a) => ({
              teamId: a.teamId,
              role: a.role,
            })),
          },
        },
        include: InvitationsService.relationInclude,
      });
    });

    await this.sendInvitationEmail(invitation, inviter);
    return invitation;
  }

  async revoke(
    ability: AppAbility,
    clubId: string,
    invitationId: string,
  ): Promise<InvitationWithRelations> {
    await this.clubsService.getClubForAbility(ability, clubId, 'read');
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, clubId },
      include: InvitationsService.relationInclude,
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found in this club');
    }
    if (ability.cannot('delete', toSubject('Invitation', invitation))) {
      throw new ForbiddenException(
        'You are not allowed to manage invitations of this club',
      );
    }
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new ConflictException('Only pending invitations can be revoked');
    }
    return this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.REVOKED },
      include: InvitationsService.relationInclude,
    });
  }

  async preview(token: string): Promise<{
    clubName: string;
    maskedEmail: string;
    status: InvitationPreviewStatus;
  }> {
    if (!token) {
      throw new NotFoundException('Invitation not found');
    }
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: { club: true },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    return {
      clubName: invitation.club.name,
      maskedEmail: this.maskEmail(invitation.email),
      status: this.previewStatus(invitation),
    };
  }

  async redeem(user: User, token: string): Promise<ClubMembershipWithUser> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: { teamAssignments: true },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new GoneException(
        `This invitation is no longer valid (${invitation.status.toLowerCase()})`,
      );
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw new GoneException('This invitation has expired');
    }

    return this.prisma.$transaction(async (tx) => {
      // Claim the invitation first — the conditional update is the concurrency
      // guard: of two concurrent redeems only one matches status PENDING.
      const claimed = await tx.invitation.updateMany({
        where: {
          id: invitation.id,
          status: InvitationStatus.PENDING,
          expiresAt: { gt: new Date() },
        },
        data: {
          status: InvitationStatus.ACCEPTED,
          acceptedById: user.id,
        },
      });
      if (claimed.count === 0) {
        throw new GoneException('This invitation is no longer valid');
      }

      // Club membership: keep the higher role (CLUB_ADMIN wins).
      const existingClub = await tx.clubMembership.findUnique({
        where: {
          userId_clubId: { userId: user.id, clubId: invitation.clubId },
        },
      });
      const clubRole = this.higherClubRole(
        existingClub?.role,
        invitation.clubRole,
      );
      const membership = await tx.clubMembership.upsert({
        where: {
          userId_clubId: { userId: user.id, clubId: invitation.clubId },
        },
        create: { userId: user.id, clubId: invitation.clubId, role: clubRole },
        update: { role: clubRole },
        include: { user: true },
      });

      // Team memberships: create per assignment, keeping TEAM_ADMIN if present.
      for (const assignment of invitation.teamAssignments) {
        const existingTeam = await tx.teamMembership.findUnique({
          where: {
            userId_teamId: { userId: user.id, teamId: assignment.teamId },
          },
        });
        const teamRole = this.higherTeamRole(
          existingTeam?.role,
          assignment.role,
        );
        await tx.teamMembership.upsert({
          where: {
            userId_teamId: { userId: user.id, teamId: assignment.teamId },
          },
          create: {
            userId: user.id,
            teamId: assignment.teamId,
            role: teamRole,
          },
          update: { role: teamRole },
        });
      }

      return membership;
    });
  }

  private higherClubRole(
    existing: ClubRole | undefined,
    invited: ClubRole,
  ): ClubRole {
    return existing === ClubRole.CLUB_ADMIN || invited === ClubRole.CLUB_ADMIN
      ? ClubRole.CLUB_ADMIN
      : ClubRole.MEMBER;
  }

  private higherTeamRole(
    existing: TeamRole | undefined,
    assigned: TeamRole,
  ): TeamRole {
    return existing === TeamRole.TEAM_ADMIN || assigned === TeamRole.TEAM_ADMIN
      ? TeamRole.TEAM_ADMIN
      : TeamRole.PLAYER;
  }

  private dedupeAssignments(
    assignments: { teamId: string; role: TeamRole }[],
  ): { teamId: string; role: TeamRole }[] {
    const byTeam = new Map<string, TeamRole>();
    for (const a of assignments) {
      // Keep the strongest requested role for the same team.
      byTeam.set(a.teamId, this.higherTeamRole(byTeam.get(a.teamId), a.role));
    }
    return [...byTeam].map(([teamId, role]) => ({ teamId, role }));
  }

  private previewStatus(invitation: Invitation): InvitationPreviewStatus {
    switch (invitation.status) {
      case InvitationStatus.ACCEPTED:
        return 'accepted';
      case InvitationStatus.REVOKED:
        return 'revoked';
      default:
        return invitation.expiresAt.getTime() <= Date.now()
          ? 'expired'
          : 'valid';
    }
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) {
      return `${local.charAt(0)}***`;
    }
    const lastDot = domain.lastIndexOf('.');
    if (lastDot <= 0) {
      return `${local.charAt(0)}***@${domain.charAt(0)}***`;
    }
    const tld = domain.slice(lastDot + 1);
    return `${local.charAt(0)}***@${domain.charAt(0)}***.${tld}`;
  }

  private async sendInvitationEmail(
    invitation: InvitationWithRelations,
    inviter: User,
  ): Promise<void> {
    const portalUrl =
      this.config.get<string>('PORTAL_URL') ?? 'http://localhost:5174';
    const link = `${portalUrl.replace(/\/$/, '')}/invite/${invitation.token}`;
    const { subject, html, text } = buildInvitationEmail({
      locale: inviter.locale,
      clubName: invitation.club.name,
      link,
    });
    try {
      await this.emailService.send({
        to: invitation.email,
        subject,
        html,
        text,
      });
    } catch (error) {
      // A failed send must NOT roll back the invitation — it can be resent.
      this.logger.error(
        `Failed to send invitation email to ${invitation.email} (invitation ${invitation.id}). Link: ${link}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
