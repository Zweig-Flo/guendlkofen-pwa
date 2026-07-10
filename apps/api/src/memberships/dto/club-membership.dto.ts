import { ApiProperty } from '@nestjs/swagger';
import type { ClubMembership, User } from '../../generated/prisma/client';
import { ClubRole } from '../../generated/prisma/client';
import { MemberUserDto } from '../../users/dto/member-user.dto';

export class ClubMembershipDto {
  @ApiProperty({
    description: 'Membership id',
    example: 'cmrf55tba0002wftfb78qh896',
  })
  id: string;

  @ApiProperty({
    description: 'Id of the club',
    example: 'cmrf55tba0000wftfb78qh894',
  })
  clubId: string;

  @ApiProperty({
    description: 'Id of the member user',
    example: 'cmrf55tba0003wftfb78qh897',
  })
  userId: string;

  @ApiProperty({
    description: 'Role of the user within the club',
    enum: ClubRole,
    example: ClubRole.MEMBER,
  })
  role: ClubRole;

  @ApiProperty({ description: 'The member user', type: MemberUserDto })
  user: MemberUserDto;

  static fromMembership(
    membership: ClubMembership & { user: User },
  ): ClubMembershipDto {
    const dto = new ClubMembershipDto();
    dto.id = membership.id;
    dto.clubId = membership.clubId;
    dto.userId = membership.userId;
    dto.role = membership.role;
    dto.user = MemberUserDto.fromUser(membership.user);
    return dto;
  }
}
