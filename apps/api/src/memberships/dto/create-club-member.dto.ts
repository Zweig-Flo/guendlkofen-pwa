import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ClubRole } from '../../generated/prisma/client';

export class CreateClubMemberDto {
  @ApiProperty({
    description: 'Id of an existing user to add to the club',
    example: 'cmrf55tba0003wftfb78qh897',
  })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiPropertyOptional({
    description: 'Role within the club (defaults to MEMBER)',
    enum: ClubRole,
    default: ClubRole.MEMBER,
  })
  @IsOptional()
  @IsEnum(ClubRole)
  role: ClubRole = ClubRole.MEMBER;
}
