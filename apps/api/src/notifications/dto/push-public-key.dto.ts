import { ApiProperty } from '@nestjs/swagger';

export class PushPublicKeyDto {
  @ApiProperty({
    description:
      'VAPID public key (URL-safe base64) for pushManager.subscribe. Empty string when push is not configured on the server.',
    example: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkTjq1...',
  })
  publicKey: string;
}
