import { ApiProperty } from '@nestjs/swagger';
import type { TeamMembership, User } from '../../generated/prisma/client';
import { TeamRole } from '../../generated/prisma/client';
import { MemberUserDto } from '../../users/dto/member-user.dto';

export class TeamMembershipDto {
  @ApiProperty({
    description: 'Membership id',
    example: 'cmrf55tba0004wftfb78qh898',
  })
  id: string;

  @ApiProperty({
    description: 'Id of the team',
    example: 'cmrf55tba0001wftfb78qh895',
  })
  teamId: string;

  @ApiProperty({
    description: 'Id of the member user',
    example: 'cmrf55tba0003wftfb78qh897',
  })
  userId: string;

  @ApiProperty({
    description: 'Role of the user within the team',
    enum: TeamRole,
    example: TeamRole.PLAYER,
  })
  role: TeamRole;

  @ApiProperty({ description: 'The member user', type: MemberUserDto })
  user: MemberUserDto;

  static fromMembership(
    membership: TeamMembership & { user: User },
  ): TeamMembershipDto {
    const dto = new TeamMembershipDto();
    dto.id = membership.id;
    dto.teamId = membership.teamId;
    dto.userId = membership.userId;
    dto.role = membership.role;
    dto.user = MemberUserDto.fromUser(membership.user);
    return dto;
  }
}
