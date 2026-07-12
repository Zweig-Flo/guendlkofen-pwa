import { ApiProperty } from '@nestjs/swagger';
import type { ChatMessage, User } from '../../generated/prisma/client';
import { MemberUserDto } from '../../users/dto/member-user.dto';

/** A single chat message, with its content already decrypted for the client. */
export class ChatMessageDto {
  @ApiProperty({
    description: 'Message id',
    example: 'cmrf55tba0005wftfb78qh899',
  })
  id: string;

  @ApiProperty({
    description: 'Id of the team the message belongs to',
    example: 'cmrf55tba0001wftfb78qh895',
  })
  teamId: string;

  @ApiProperty({
    description: 'Author, or null if the account was deleted',
    type: MemberUserDto,
    nullable: true,
  })
  author: MemberUserDto | null;

  @ApiProperty({
    description: 'Decrypted message text',
    example: 'Wer bringt am Samstag die Bälle mit?',
  })
  content: string;

  @ApiProperty({
    description: 'When the message was sent (UTC)',
    example: '2026-09-12T13:00:00.000Z',
  })
  createdAt: Date;

  static from(
    message: ChatMessage,
    author: User | null,
    decryptedContent: string,
  ): ChatMessageDto {
    const dto = new ChatMessageDto();
    dto.id = message.id;
    dto.teamId = message.teamId;
    dto.author = author ? MemberUserDto.fromUser(author) : null;
    dto.content = decryptedContent;
    dto.createdAt = message.createdAt;
    return dto;
  }
}
