import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsOptional } from 'class-validator';
import { EventStatus } from '../../generated/prisma/client';

/** Parses the string a query param arrives as into a real boolean. */
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true' || value === '1') {
    return true;
  }
  if (value === 'false' || value === '0') {
    return false;
  }
  return value;
};

export class ListEventsQueryDto {
  @ApiPropertyOptional({
    description: 'Only events at/after this instant (ISO 8601)',
    example: '2026-09-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Only events at/before this instant (ISO 8601)',
    example: '2026-12-31T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Include events whose kickoff is already in the past',
    default: false,
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includePast?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by event status',
    enum: EventStatus,
  })
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;
}
