import { ApiProperty } from '@nestjs/swagger';
import type { Event } from '../../generated/prisma/client';
import { EventDto } from './event.dto';
import { VoteDto } from './vote.dto';
import type { VoteSummaryDto } from './vote-summary.dto';

export class EventDetailDto extends EventDto {
  @ApiProperty({
    description: "Every teammate's vote for this event",
    type: VoteDto,
    isArray: true,
  })
  votes: VoteDto[];

  static fromEntityWithVotes(
    event: Event & { votes: Parameters<typeof VoteDto.fromEntity>[0][] },
    summary: VoteSummaryDto,
  ): EventDetailDto {
    const base = EventDto.fromEntity(event, summary);
    const dto = new EventDetailDto();
    Object.assign(dto, base);
    dto.votes = event.votes.map((vote) => VoteDto.fromEntity(vote));
    return dto;
  }
}
