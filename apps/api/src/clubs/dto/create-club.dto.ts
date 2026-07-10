import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateClubDto {
  @ApiProperty({ description: 'Club name', example: 'SV Gündlkofen' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
