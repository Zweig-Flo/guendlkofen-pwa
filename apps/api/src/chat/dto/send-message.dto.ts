import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export const MAX_MESSAGE_LENGTH = 2000;

export class SendMessageDto {
  @ApiProperty({
    description: 'Message text (plain UTF-8; encrypted server-side at rest)',
    example: 'Wer bringt am Samstag die Bälle mit?',
    maxLength: MAX_MESSAGE_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_MESSAGE_LENGTH)
  content: string;
}
