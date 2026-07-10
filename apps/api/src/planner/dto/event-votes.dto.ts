import { ApiProperty } from '@nestjs/swagger';
import { VoteChoice } from '../../generated/prisma/client';
import { VoteSummaryDto } from './vote-summary.dto';

export class TeammateVoteDto {
  @ApiProperty({
    description: 'Id of the voting user',
    example: 'cmrf55tba0000wftfb78qh894',
  })
  userId: string;

  @ApiProperty({
    description: 'Display name of the voter (for avatars / initials)',
    example: 'Max Mustermann',
    nullable: true,
    type: String,
  })
  userName: string | null;

  @ApiProperty({ description: 'The vote', enum: VoteChoice })
  choice: VoteChoice;
}

export class EventVotesDto {
  @ApiProperty({
    description: 'Id of the event',
    example: 'cmrf55tba0005wftfb78qh899',
  })
  eventId: string;

  @ApiProperty({
    description: "Teammates' votes for this event",
    type: TeammateVoteDto,
    isArray: true,
  })
  votes: TeammateVoteDto[];

  @ApiProperty({ description: 'Vote tally + caller vote', type: VoteSummaryDto })
  summary: VoteSummaryDto;
}
