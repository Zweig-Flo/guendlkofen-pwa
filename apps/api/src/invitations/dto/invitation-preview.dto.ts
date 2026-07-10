import { ApiProperty } from '@nestjs/swagger';

export type InvitationPreviewStatus =
  'valid' | 'expired' | 'revoked' | 'accepted';

/**
 * Public, id-free view of an invitation shown on the acceptance landing page
 * before the invitee logs in. Enough to recognise the invite, nothing more.
 */
export class InvitationPreviewDto {
  @ApiProperty({
    description: 'Name of the inviting club',
    example: 'TC Guendlkofen',
  })
  clubName: string;

  @ApiProperty({
    description: 'Masked invited email (e.g. f***@e***.com)',
    example: 'n***@e***.com',
  })
  maskedEmail: string;

  @ApiProperty({
    description:
      "Computed status: 'valid' (PENDING, not expired), 'expired' (PENDING but past expiry), 'revoked', or 'accepted'",
    enum: ['valid', 'expired', 'revoked', 'accepted'],
    example: 'valid',
  })
  status: InvitationPreviewStatus;
}
