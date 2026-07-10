import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ClubRole } from '../../generated/prisma/client';

export class UpdateClubMemberDto {
  @ApiProperty({
    description:
      'New role within the club — this is how members are promoted to club admins',
    enum: ClubRole,
    example: ClubRole.CLUB_ADMIN,
  })
  @IsEnum(ClubRole)
  role: ClubRole;
}
