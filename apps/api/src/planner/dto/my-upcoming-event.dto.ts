import { ApiProperty } from '@nestjs/swagger';
import type { Event, Team } from '../../generated/prisma/client';
import { EventDto } from './event.dto';
import type { VoteSummaryDto } from './vote-summary.dto';

export class MyUpcomingTeamDto {
  @ApiProperty({ description: 'Team id', example: 'cmrf55tba0001wftfb78qh895' })
  id: string;

  @ApiProperty({ description: 'Team name', example: 'Herren 1' })
  name: string;

  @ApiProperty({ description: 'Sport of the team', example: 'Tennis' })
  sport: string;
}

export class MyUpcomingEventDto extends EventDto {
  @ApiProperty({
    description: 'The team this game belongs to',
    type: MyUpcomingTeamDto,
  })
  team: MyUpcomingTeamDto;

  @ApiProperty({
    description: 'Id of the club the team belongs to',
    example: 'cmrf55tba0000wftfb78qh894',
  })
  clubId: string;

  static fromEntity(
    event: Event & { team: Team },
    summary: VoteSummaryDto,
  ): MyUpcomingEventDto {
    const base = EventDto.fromEntity(event, summary);
    const dto = new MyUpcomingEventDto();
    Object.assign(dto, base);
    dto.team = {
      id: event.team.id,
      name: event.team.name,
      sport: event.team.sport,
    };
    dto.clubId = event.team.clubId;
    return dto;
  }
}
