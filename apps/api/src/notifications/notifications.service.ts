import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../email/email.service';
import type { ReminderKind, User } from '../generated/prisma/client';
import { PushService } from './push.service';
import { buildReminderMessage, escapeHtml } from './reminder-texts';

/** Everything needed to render and deep-link a single reminder. */
export interface NotificationContent {
  kind: ReminderKind;
  clubName: string;
  teamName: string;
  opponent: string;
  kickoff: Date;
  /** Deep link to the event page for the push/email tap target. */
  url: string;
}

/**
 * Turns a reminder into an actual notification: localized by `user.locale`,
 * pushed to all of the user's devices, and — when the user has no push
 * subscriptions — delivered by email instead (via the existing EmailService).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly push: PushService,
    private readonly email: EmailService,
  ) {}

  /**
   * Push-only notification (no email fallback) for high-frequency, low-urgency
   * events like chat. Delivered to every device the user has subscribed; users
   * with no push subscription simply receive nothing.
   */
  async sendPushOnly(
    user: User,
    payload: { title: string; body: string; url: string },
  ): Promise<void> {
    await this.push.sendToUser(user.id, payload);
  }

  async notify(user: User, content: NotificationContent): Promise<void> {
    const built = buildReminderMessage({
      kind: content.kind,
      locale: user.locale,
      clubName: content.clubName,
      teamName: content.teamName,
      opponent: content.opponent,
      kickoff: content.kickoff,
    });

    const { subscriptionCount } = await this.push.sendToUser(user.id, {
      title: built.title,
      body: built.body,
      url: content.url,
    });

    if (subscriptionCount > 0) {
      return;
    }

    // No push subscriptions — fall back to email if we have an address.
    if (!user.email) {
      this.logger.warn(
        `User ${user.id} has no push subscriptions and no email — reminder dropped.`,
      );
      return;
    }

    const text = [built.body, '', content.url].join('\n');
    const html = [
      `<p>${escapeHtml(built.body)}</p>`,
      `<p><a href="${content.url}">${escapeHtml(built.title)}</a></p>`,
    ].join('\n');

    await this.email.send({
      to: user.email,
      subject: built.title,
      text,
      html,
    });
  }
}
