import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ClubRole, TeamRole } from '../../generated/prisma/client';

export class CreateInvitationTeamAssignmentDto {
  @ApiProperty({
    description: 'Id of a team of this club to pre-assign the invitee to',
    example: 'cmrf55tba0001wftfb78qh895',
  })
  @IsString()
  @IsNotEmpty()
  teamId: string;

  @ApiPropertyOptional({
    description: 'Role within the team (defaults to PLAYER)',
    enum: TeamRole,
    default: TeamRole.PLAYER,
  })
  @IsOptional()
  @IsEnum(TeamRole)
  role: TeamRole = TeamRole.PLAYER;
}

export class CreateInvitationDto {
  @ApiProperty({
    description: 'Email address to invite into the club',
    example: 'newplayer@example.com',
  })
  // Normalized so the supersede/dedup check can't be bypassed by case variants
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    description: 'Role within the club (defaults to MEMBER)',
    enum: ClubRole,
    default: ClubRole.MEMBER,
  })
  @IsOptional()
  @IsEnum(ClubRole)
  clubRole: ClubRole = ClubRole.MEMBER;

  @ApiPropertyOptional({
    description: 'Teams of this club to pre-assign the invitee to',
    type: [CreateInvitationTeamAssignmentDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvitationTeamAssignmentDto)
  teamAssignments?: CreateInvitationTeamAssignmentDto[];
}
