import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { TeamRole } from '../../generated/prisma/client';

export class UpdateTeamMemberDto {
  @ApiProperty({
    description:
      'New role within the team — this is how players are promoted to team admins',
    enum: TeamRole,
    example: TeamRole.TEAM_ADMIN,
  })
  @IsEnum(TeamRole)
  role: TeamRole;
}
