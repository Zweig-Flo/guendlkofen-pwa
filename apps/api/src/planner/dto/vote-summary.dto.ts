import { ApiProperty } from '@nestjs/swagger';
import { VoteChoice } from '../../generated/prisma/client';

export class VoteSummaryDto {
  @ApiProperty({ description: 'Number of YES votes', example: 3 })
  yesCount: number;

  @ApiProperty({ description: 'Number of NO votes', example: 1 })
  noCount: number;

  @ApiProperty({
    description: 'Team members who have not voted yet',
    example: 2,
  })
  notVotedCount: number;

  @ApiProperty({
    description: "The caller's own vote, or null if they have not voted",
    enum: VoteChoice,
    nullable: true,
    type: String,
    example: VoteChoice.YES,
  })
  myVote: VoteChoice | null;
}
