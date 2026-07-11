import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ImportRowErrorDto {
  @ApiProperty({
    description: '1-based index of the offending data row (header excluded)',
    example: 2,
  })
  row: number;

  @ApiPropertyOptional({
    description: 'Canonical field the error relates to, if applicable',
    example: 'date',
  })
  field?: string;

  @ApiProperty({
    description: 'i18n key or plain-English message for the failure',
    example: 'import.error.badDate',
  })
  message: string;

  @ApiProperty({
    description: 'The raw row content, for the user to locate it',
    example: '2026-13-40;15:00;SV Musterhausen;;Heim;',
  })
  raw: string;
}

export class ImportResultDto {
  @ApiProperty({ description: 'Number of data rows parsed', example: 3 })
  totalRows: number;

  @ApiProperty({ description: 'Newly created events', example: 2 })
  imported: number;

  @ApiProperty({
    description: 'Matched an existing importKey and were changed',
    example: 1,
  })
  updated: number;

  @ApiProperty({
    description: 'Duplicates / unchanged rows (no-op)',
    example: 0,
  })
  skipped: number;

  @ApiProperty({
    description: 'Number of rows that failed validation',
    example: 0,
  })
  errorCount: number;

  @ApiProperty({
    description: 'Per-row errors',
    type: ImportRowErrorDto,
    isArray: true,
  })
  errors: ImportRowErrorDto[];
}
