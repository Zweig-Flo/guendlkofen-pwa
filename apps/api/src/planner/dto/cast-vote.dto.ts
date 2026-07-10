import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { VoteChoice } from '../../generated/prisma/client';

export class CastVoteDto {
  @ApiProperty({
    description: 'The caller\'s availability for this game',
    enum: VoteChoice,
    example: VoteChoice.YES,
  })
  @IsEnum(VoteChoice)
  choice: VoteChoice;
}
