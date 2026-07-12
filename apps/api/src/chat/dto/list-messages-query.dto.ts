import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const DEFAULT_MESSAGE_LIMIT = 50;
export const MAX_MESSAGE_LIMIT = 100;

export class ListMessagesQueryDto {
  @ApiPropertyOptional({
    description:
      'Return messages older than the message with this id (for upward infinite scroll)',
    example: 'cmrf55tba0005wftfb78qh899',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Page size',
    default: DEFAULT_MESSAGE_LIMIT,
    minimum: 1,
    maximum: MAX_MESSAGE_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_MESSAGE_LIMIT)
  limit?: number;
}
