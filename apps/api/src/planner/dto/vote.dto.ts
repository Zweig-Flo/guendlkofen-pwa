import { ApiProperty } from '@nestjs/swagger';
import { VoteChoice, type Vote } from '../../generated/prisma/client';

export class VoteDto {
  @ApiProperty({ description: 'Vote id', example: 'cmrf55tba0006wftfb78qh900' })
  id: string;

  @ApiProperty({
    description: 'Id of the event voted on',
    example: 'cmrf55tba0005wftfb78qh899',
  })
  eventId: string;

  @ApiProperty({
    description: 'Id of the voting user',
    example: 'cmrf55tba0000wftfb78qh894',
  })
  userId: string;

  @ApiProperty({ description: 'The vote', enum: VoteChoice })
  choice: VoteChoice;

  @ApiProperty({
    description: 'When the vote was last cast or changed',
    example: '2026-09-01T09:30:00.000Z',
  })
  updatedAt: Date;

  static fromEntity(vote: Vote): VoteDto {
    const dto = new VoteDto();
    dto.id = vote.id;
    dto.eventId = vote.eventId;
    dto.userId = vote.userId;
    dto.choice = vote.choice;
    dto.updatedAt = vote.updatedAt;
    return dto;
  }
}
