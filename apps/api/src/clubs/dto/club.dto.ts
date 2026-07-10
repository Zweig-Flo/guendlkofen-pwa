import { ApiProperty } from '@nestjs/swagger';
import type { Club } from '../../generated/prisma/client';

export class ClubDto {
  @ApiProperty({
    description: 'Club id',
    example: 'cmrf55tba0000wftfb78qh894',
  })
  id: string;

  @ApiProperty({ description: 'Club name', example: 'SV Gündlkofen' })
  name: string;

  static fromClub(club: Club): ClubDto {
    const dto = new ClubDto();
    dto.id = club.id;
    dto.name = club.name;
    return dto;
  }
}
