import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { HomeAway } from '../../generated/prisma/client';

export class CreateEventDto {
  @ApiProperty({
    description: 'Kickoff time, ISO 8601 (stored as UTC)',
    example: '2026-09-12T13:00:00.000Z',
  })
  @IsDateString()
  startsAt: string;

  @ApiProperty({
    description: 'Opponent — free text; required, a game needs one',
    example: 'SV Musterhausen',
  })
  @IsString()
  @IsNotEmpty()
  opponent: string;

  @ApiPropertyOptional({
    description: 'Venue / address',
    example: 'Sportplatz Gündlkofen',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  location?: string;

  @ApiPropertyOptional({
    description: 'Home / away / neutral venue',
    enum: HomeAway,
    default: HomeAway.HOME,
  })
  @IsOptional()
  @IsEnum(HomeAway)
  homeAway?: HomeAway;

  @ApiPropertyOptional({
    description: 'Free-text meta (meeting time, kit colour, …)',
    example: 'Treffen 14:15',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
