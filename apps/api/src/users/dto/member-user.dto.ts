import { ApiProperty } from '@nestjs/swagger';
import type { User } from '../../generated/prisma/client';

/**
 * Public view of a user as shown to fellow club/team members.
 * Deliberately excludes privileged fields like isSuperAdmin.
 */
export class MemberUserDto {
  @ApiProperty({
    description: 'Local user id',
    example: 'cmrf55tba0000wftfb78qh894',
  })
  id: string;

  @ApiProperty({
    description: 'Email address, if known',
    example: 'player@example.com',
    nullable: true,
    type: String,
  })
  email: string | null;

  @ApiProperty({
    description: 'Display name, if known',
    example: 'Max Mustermann',
    nullable: true,
    type: String,
  })
  name: string | null;

  static fromUser(user: User): MemberUserDto {
    const dto = new MemberUserDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.name = user.name;
    return dto;
  }
}
