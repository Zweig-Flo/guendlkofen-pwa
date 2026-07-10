import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateTeamDto {
  @ApiProperty({ description: 'Team name', example: 'Herren 1' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Sport of the team', example: 'Tennis' })
  @IsString()
  @IsNotEmpty()
  sport: string;

  @ApiPropertyOptional({
    description: 'League the team plays in',
    example: 'Bezirksliga',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  league?: string;

  @ApiProperty({
    description:
      "Ordering among the club's teams of the same sport; 1 is the highest team",
    example: 1,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  rank: number;
}
