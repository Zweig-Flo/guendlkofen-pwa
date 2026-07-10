import { ApiProperty } from '@nestjs/swagger';
import type { User } from '../../generated/prisma/client';

export class UserDto {
  @ApiProperty({
    description: 'Local user id',
    example: 'cmrf55tba0000wftfb78qh894',
  })
  id: string;

  @ApiProperty({
    description: 'Email address, if known from the Auth0 token',
    example: 'player@example.com',
    nullable: true,
    type: String,
  })
  email: string | null;

  @ApiProperty({
    description: 'Display name, if known from the Auth0 token',
    example: 'Max Mustermann',
    nullable: true,
    type: String,
  })
  name: string | null;

  @ApiProperty({
    description: 'Preferred locale of the user',
    example: 'de',
  })
  locale: string;

  @ApiProperty({
    description: 'Whether the user is a platform super admin',
    example: false,
  })
  isSuperAdmin: boolean;

  static fromUser(user: User): UserDto {
    const dto = new UserDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.name = user.name;
    dto.locale = user.locale;
    dto.isSuperAdmin = user.isSuperAdmin;
    return dto;
  }
}
