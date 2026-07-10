import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { TeamRole } from '../../generated/prisma/client';

export class CreateTeamMemberDto {
  @ApiProperty({
    description:
      'Id of an existing user (must already be a club member) to add to the team',
    example: 'cmrf55tba0003wftfb78qh897',
  })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiPropertyOptional({
    description: 'Role within the team (defaults to PLAYER)',
    enum: TeamRole,
    default: TeamRole.PLAYER,
  })
  @IsOptional()
  @IsEnum(TeamRole)
  role: TeamRole = TeamRole.PLAYER;
}
