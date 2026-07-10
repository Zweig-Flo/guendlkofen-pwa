import { ApiProperty } from '@nestjs/swagger';
import type {
  Invitation,
  InvitationTeamAssignment,
  Team,
  User,
} from '../../generated/prisma/client';
import {
  ClubRole,
  InvitationStatus,
  TeamRole,
} from '../../generated/prisma/client';
import { MemberUserDto } from '../../users/dto/member-user.dto';

export class InvitationTeamAssignmentDto {
  @ApiProperty({
    description: 'Id of the assigned team',
    example: 'cmrf55tba0001wftfb78qh895',
  })
  teamId: string;

  @ApiProperty({
    description: 'Name of the assigned team',
    example: 'Herren 1',
  })
  teamName: string;

  @ApiProperty({
    description: 'Role the invitee will get in the team',
    enum: TeamRole,
    example: TeamRole.PLAYER,
  })
  role: TeamRole;
}

type InvitationWithRelations = Invitation & {
  invitedBy: User | null;
  teamAssignments: (InvitationTeamAssignment & { team: Team })[];
};

/**
 * Outgoing view of an invitation. The secret `token` is deliberately NEVER
 * exposed here — it only travels via the emailed acceptance link.
 */
export class InvitationDto {
  @ApiProperty({
    description: 'Invitation id',
    example: 'cmrf55tba0005wftfb78qh899',
  })
  id: string;

  @ApiProperty({
    description: 'Id of the club',
    example: 'cmrf55tba0000wftfb78qh894',
  })
  clubId: string;

  @ApiProperty({
    description: 'Invited email address',
    example: 'newplayer@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'Role the invitee will get in the club',
    enum: ClubRole,
    example: ClubRole.MEMBER,
  })
  clubRole: ClubRole;

  @ApiProperty({
    description: 'Current status of the invitation',
    enum: InvitationStatus,
    example: InvitationStatus.PENDING,
  })
  status: InvitationStatus;

  @ApiProperty({
    description: 'When the invitation expires',
    example: '2026-07-24T20:11:00.000Z',
  })
  expiresAt: Date;

  @ApiProperty({
    description:
      'The user who sent the invitation (null if that account was deleted)',
    type: MemberUserDto,
    nullable: true,
  })
  invitedBy: MemberUserDto | null;

  @ApiProperty({
    description: 'Pre-assigned team memberships',
    type: [InvitationTeamAssignmentDto],
  })
  teamAssignments: InvitationTeamAssignmentDto[];

  static fromInvitation(invitation: InvitationWithRelations): InvitationDto {
    const dto = new InvitationDto();
    dto.id = invitation.id;
    dto.clubId = invitation.clubId;
    dto.email = invitation.email;
    dto.clubRole = invitation.clubRole;
    dto.status = invitation.status;
    dto.expiresAt = invitation.expiresAt;
    dto.invitedBy = invitation.invitedBy
      ? MemberUserDto.fromUser(invitation.invitedBy)
      : null;
    dto.teamAssignments = invitation.teamAssignments.map((assignment) => {
      const item = new InvitationTeamAssignmentDto();
      item.teamId = assignment.teamId;
      item.teamName = assignment.team.name;
      item.role = assignment.role;
      return item;
    });
    return dto;
  }
}
