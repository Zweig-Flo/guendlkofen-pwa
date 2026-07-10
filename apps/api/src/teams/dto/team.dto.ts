import { ApiProperty } from '@nestjs/swagger';
import type { Team } from '../../generated/prisma/client';

export class TeamDto {
  @ApiProperty({
    description: 'Team id',
    example: 'cmrf55tba0001wftfb78qh895',
  })
  id: string;

  @ApiProperty({
    description: 'Id of the club the team belongs to',
    example: 'cmrf55tba0000wftfb78qh894',
  })
  clubId: string;

  @ApiProperty({ description: 'Team name', example: 'Herren 1' })
  name: string;

  @ApiProperty({ description: 'Sport of the team', example: 'Tennis' })
  sport: string;

  @ApiProperty({
    description: 'League the team plays in',
    example: 'Bezirksliga',
    nullable: true,
    type: String,
  })
  league: string | null;

  @ApiProperty({
    description:
      "Ordering among the club's teams of the same sport; 1 is the highest team",
    example: 1,
    minimum: 1,
  })
  rank: number;

  static fromTeam(team: Team): TeamDto {
    const dto = new TeamDto();
    dto.id = team.id;
    dto.clubId = team.clubId;
    dto.name = team.name;
    dto.sport = team.sport;
    dto.league = team.league;
    dto.rank = team.rank;
    return dto;
  }
}
