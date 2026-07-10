import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class UpdateTeamDto {
  @ApiPropertyOptional({ description: 'Team name', example: 'Herren 1' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ description: 'Sport of the team', example: 'Tennis' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  sport?: string;

  @ApiPropertyOptional({
    description: 'League the team plays in',
    example: 'Bezirksliga',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  league?: string;

  @ApiPropertyOptional({
    description:
      "Ordering among the club's teams of the same sport; 1 is the highest team",
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  rank?: number;
}
