import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class DeletePushSubscriptionDto {
  @ApiProperty({
    description: 'The push service endpoint URL to remove',
    example: 'https://fcm.googleapis.com/fcm/send/abc123',
  })
  @IsString()
  @IsNotEmpty()
  endpoint: string;
}
