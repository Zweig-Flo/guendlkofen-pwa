import { ApiProperty } from '@nestjs/swagger';

export class ProfileDto {
  @ApiProperty({
    description: 'Auth0 subject identifier of the logged-in user',
    example: 'auth0|507f1f77bcf86cd799439011',
  })
  sub: string;
}
