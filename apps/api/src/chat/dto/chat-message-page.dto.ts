import { ApiProperty } from '@nestjs/swagger';
import { ChatMessageDto } from './chat-message.dto';

/** One page of chat messages (newest-first) plus the cursor for the next page. */
export class ChatMessagePageDto {
  @ApiProperty({
    description: 'Messages, newest first',
    type: ChatMessageDto,
    isArray: true,
  })
  messages: ChatMessageDto[];

  @ApiProperty({
    description:
      'Cursor to pass as `cursor` to fetch the next (older) page, or null if this is the last page',
    example: 'cmrf55tba0005wftfb78qh899',
    nullable: true,
    type: String,
  })
  nextCursor: string | null;
}
