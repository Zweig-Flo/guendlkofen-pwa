import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOAuth2,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../casl/current-user.decorator';
import type { User } from '../generated/prisma/client';
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';
import { DeletePushSubscriptionDto } from './dto/delete-push-subscription.dto';
import { PushPublicKeyDto } from './dto/push-public-key.dto';
import { PushService } from './push.service';

/**
 * Self-scoped Web Push subscription management for the PWA. Every route acts on
 * `request.user` only (no CASL subjects needed) — the caller can only ever
 * touch their own subscriptions.
 */
@ApiTags('notifications')
@ApiBearerAuth()
@ApiOAuth2(['openid', 'profile', 'email'])
@Controller('me')
export class PushController {
  constructor(private readonly push: PushService) {}

  /** VAPID public key the browser needs for `pushManager.subscribe`. */
  @Get('push/public-key')
  @ApiOkResponse({ type: PushPublicKeyDto })
  getPublicKey(): PushPublicKeyDto {
    return { publicKey: this.push.getPublicKey() };
  }

  /**
   * Registers (or refreshes) a push subscription for the current user. Upserts
   * by endpoint: re-subscribing an endpoint that another user previously owned
   * MOVES it to the caller (endpoints are device-bound and globally unique).
   */
  @Post('push-subscriptions')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Subscription stored.' })
  async subscribe(
    @CurrentUser() user: User,
    @Body() dto: CreatePushSubscriptionDto,
  ): Promise<void> {
    await this.push.saveSubscription(user.id, dto);
  }

  /**
   * Removes a push subscription on logout / opt-out. Self-scoped: only the
   * caller's own subscription is deleted. Deleting an unknown (or someone
   * else's) endpoint is a 204 no-op.
   */
  @Delete('push-subscriptions')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Subscription removed (or absent).' })
  async unsubscribe(
    @CurrentUser() user: User,
    @Body() dto: DeletePushSubscriptionDto,
  ): Promise<void> {
    await this.push.deleteSubscription(user.id, dto.endpoint);
  }
}
