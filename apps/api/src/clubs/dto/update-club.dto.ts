import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateClubDto {
  @ApiPropertyOptional({ description: 'Club name', example: 'SV Gündlkofen' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;
}
