import { ApiProperty } from '@nestjs/swagger';
import {
  EventSource,
  EventStatus,
  HomeAway,
  type Event,
} from '../../generated/prisma/client';
import { VoteSummaryDto } from './vote-summary.dto';

export class EventDto {
  @ApiProperty({ description: 'Event id', example: 'cmrf55tba0005wftfb78qh899' })
  id: string;

  @ApiProperty({
    description: 'Id of the team the event belongs to',
    example: 'cmrf55tba0001wftfb78qh895',
  })
  teamId: string;

  @ApiProperty({
    description: 'Kickoff time (UTC)',
    example: '2026-09-12T13:00:00.000Z',
  })
  startsAt: Date;

  @ApiProperty({ description: 'Opponent', example: 'SV Musterhausen' })
  opponent: string;

  @ApiProperty({
    description: 'Venue / address',
    example: 'Sportplatz Gündlkofen',
    nullable: true,
    type: String,
  })
  location: string | null;

  @ApiProperty({ description: 'Home / away / neutral', enum: HomeAway })
  homeAway: HomeAway;

  @ApiProperty({
    description: 'Free-text meta',
    example: 'Treffen 14:15',
    nullable: true,
    type: String,
  })
  notes: string | null;

  @ApiProperty({ description: 'Event status', enum: EventStatus })
  status: EventStatus;

  @ApiProperty({ description: 'How the event was created', enum: EventSource })
  source: EventSource;

  @ApiProperty({ description: 'Vote tally + caller vote', type: VoteSummaryDto })
  summary: VoteSummaryDto;

  static fromEntity(event: Event, summary: VoteSummaryDto): EventDto {
    const dto = new EventDto();
    dto.id = event.id;
    dto.teamId = event.teamId;
    dto.startsAt = event.startsAt;
    dto.opponent = event.opponent;
    dto.location = event.location;
    dto.homeAway = event.homeAway;
    dto.notes = event.notes;
    dto.status = event.status;
    dto.source = event.source;
    dto.summary = summary;
    return dto;
  }
}
