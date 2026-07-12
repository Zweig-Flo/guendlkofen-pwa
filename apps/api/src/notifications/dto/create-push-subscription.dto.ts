import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class PushSubscriptionKeysDto {
  @ApiProperty({
    description: "The subscription's P-256 ECDH public key (base64url)",
  })
  @IsString()
  @IsNotEmpty()
  p256dh: string;

  @ApiProperty({ description: 'The subscription auth secret (base64url)' })
  @IsString()
  @IsNotEmpty()
  auth: string;
}

export class CreatePushSubscriptionDto {
  @ApiProperty({
    description: 'The push service endpoint URL (globally unique per device)',
    example: 'https://fcm.googleapis.com/fcm/send/abc123',
  })
  @IsString()
  @IsNotEmpty()
  endpoint: string;

  @ApiProperty({ type: PushSubscriptionKeysDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys: PushSubscriptionKeysDto;

  @ApiProperty({
    required: false,
    description: 'Optional user-agent string of the subscribing device',
  })
  @IsOptional()
  @IsString()
  userAgent?: string;
}
