import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';

/** JSON the service worker receives in the `push` event. */
export interface PushPayload {
  title: string;
  body: string;
  /** Deep link opened when the notification is tapped. */
  url: string;
}

export interface SendResult {
  /** How many subscriptions the user had at send time (0 → caller may fall back to email). */
  subscriptionCount: number;
}

/**
 * Wraps `web-push` with VAPID configuration.
 *
 * - When `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` are set, notifications are
 *   delivered through the push services of the user's subscribed devices.
 * - Otherwise (local dev / tests) the payload is logged instead — same
 *   fallback pattern as `EmailService`.
 *
 * Subscriptions that a push service reports as gone (404/410) are pruned.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly configured: boolean;
  private readonly publicKey: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject =
      this.config.get<string>('VAPID_SUBJECT') ??
      'mailto:no-reply@guendlkofen.app';

    this.publicKey = publicKey ?? '';
    this.configured = Boolean(publicKey && privateKey);
    if (this.configured) {
      webpush.setVapidDetails(subject, publicKey!, privateKey!);
    } else {
      this.logger.warn(
        'VAPID keys not configured — push payloads will be logged, not sent.',
      );
    }
  }

  /** The VAPID public key browsers need for `pushManager.subscribe`. */
  getPublicKey(): string {
    return this.publicKey;
  }

  /**
   * Stores a subscription for `userId`, keyed by its (globally unique) endpoint.
   * Re-subscribing an endpoint that belonged to another user MOVES it to the
   * caller — endpoints are device-bound, so the last user to subscribe on a
   * device owns it.
   */
  async saveSubscription(
    userId: string,
    dto: CreatePushSubscriptionDto,
  ): Promise<void> {
    this.assertSafeEndpoint(dto.endpoint);
    const data = {
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
      userAgent: dto.userAgent ?? null,
    };
    const existing = await this.prisma.pushSubscription.findUnique({
      where: { endpoint: dto.endpoint },
      select: { userId: true },
    });
    if (existing && existing.userId !== userId) {
      // Legitimate when a device changes hands/accounts, but worth an audit
      // trail: the previous owner silently stops receiving on this endpoint.
      this.logger.warn(
        `Push endpoint ownership moved from user ${existing.userId} to ${userId}`,
      );
    }
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: { userId, endpoint: dto.endpoint, ...data },
      update: { userId, ...data },
    });
  }

  /**
   * The endpoint is attacker-controlled input that we later POST to from the
   * server (via web-push) — classic SSRF surface. Require https and reject
   * loopback/private/link-local hosts; real push services are public HTTPS.
   */
  private assertSafeEndpoint(endpoint: string): void {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      throw new BadRequestException('endpoint must be a valid URL');
    }
    if (url.protocol !== 'https:') {
      throw new BadRequestException('endpoint must use https');
    }
    const host = url.hostname.toLowerCase();
    const isPrivate =
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^169\.254\./.test(host) ||
      host === '::1' ||
      host === '[::1]' ||
      /^\[?f[cd][0-9a-f]{2}:/i.test(host) || // IPv6 ULA
      /^\[?fe80:/i.test(host); // IPv6 link-local
    if (isPrivate) {
      throw new BadRequestException(
        'endpoint must be a public push-service URL',
      );
    }
  }

  /**
   * Removes one of the caller's subscriptions. Self-scoped by `userId`, so a
   * user can never delete another user's subscription; deleting an unknown (or
   * foreign) endpoint is a silent no-op.
   */
  async deleteSubscription(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({
      where: { endpoint, userId },
    });
  }

  /**
   * Sends `payload` to every subscription the user owns. Expired subscriptions
   * (push service returns 404/410) are deleted. Returns how many subscriptions
   * existed so the caller can decide on an email fallback.
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<SendResult> {
    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });
    if (subs.length === 0) {
      return { subscriptionCount: 0 };
    }

    const body = JSON.stringify(payload);

    if (!this.configured) {
      this.logger.log(
        `Push (not sent, VAPID keys unset) to ${subs.length} subscription(s):\n${body}`,
      );
      return { subscriptionCount: subs.length };
    }

    const dead: string[] = [];
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body,
          );
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            // Subscription is gone for good — schedule it for removal.
            dead.push(sub.endpoint);
          } else {
            this.logger.warn(
              `Push send failed (status ${statusCode ?? 'unknown'}) for ${sub.endpoint}`,
            );
          }
        }
      }),
    );

    if (dead.length > 0) {
      await this.prisma.pushSubscription.deleteMany({
        where: { endpoint: { in: dead } },
      });
      this.logger.log(`Pruned ${dead.length} expired push subscription(s).`);
    }

    return { subscriptionCount: subs.length };
  }
}
