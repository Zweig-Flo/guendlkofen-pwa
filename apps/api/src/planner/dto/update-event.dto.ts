import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { EventStatus } from '../../generated/prisma/client';
import { CreateEventDto } from './create-event.dto';

/**
 * All event fields are optional here. Changing `startsAt` = reschedule (same
 * row, votes kept). Setting `status = CANCELLED` cancels without deleting.
 */
export class UpdateEventDto extends PartialType(CreateEventDto) {
  @ApiPropertyOptional({
    description: 'Event status; set to CANCELLED to cancel the game',
    enum: EventStatus,
  })
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;
}
