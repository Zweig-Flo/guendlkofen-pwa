import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  EventStatus,
  Prisma,
  ReminderKind,
  VoteChoice,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sends the planner reminder loop (Florian's decision, docs/PLATFORM.md):
 *   VOTE_7D — 7 days out, member has not voted yet
 *   VOTE_2D — 2 days out, member still has not voted
 *   INFO_1D — 1 day out, member voted YES (a "see you tomorrow" nudge)
 * NO-voters are deliberately never reminded again.
 *
 * Runs hourly. Every send writes a ReminderLog row keyed by
 * (event, user, kind); the unique constraint makes concurrent ticks safe
 * (a losing `create` throws P2002 = already sent, so we skip).
 */
@Injectable()
export class ReminderScheduler {
  private readonly logger = new Logger(ReminderScheduler.name);
  private readonly webAppUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {
    this.webAppUrl = (
      this.config.get<string>('WEB_APP_URL') ?? 'http://localhost:5173'
    ).replace(/\/+$/, '');
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleReminders(): Promise<void> {
    const sent = await this.tick(new Date());
    if (sent > 0) {
      this.logger.log(`Reminder tick sent ${sent} notification(s).`);
    }
  }

  /**
   * One reminder sweep. Batched: a single query pulls every eligible event
   * with its team, club, memberships (+user) and votes, so there is no
   * per-user N+1. Returns the number of notifications dispatched.
   */
  async tick(now: Date): Promise<number> {
    // Only future SCHEDULED events inside the widest (7-day) window matter.
    const horizon = new Date(now.getTime() + 7 * DAY_MS);
    const events = await this.prisma.event.findMany({
      where: {
        status: EventStatus.SCHEDULED,
        startsAt: { gt: now, lte: horizon },
      },
      include: {
        team: {
          include: {
            club: true,
            memberships: { include: { user: true } },
          },
        },
        votes: true,
        reminderLogs: true,
      },
    });

    let dispatched = 0;
    for (const event of events) {
      const startsMs = event.startsAt.getTime();
      const within7d = startsMs <= now.getTime() + 7 * DAY_MS;
      const within2d = startsMs <= now.getTime() + 2 * DAY_MS;
      const within1d = startsMs <= now.getTime() + 1 * DAY_MS;

      const voteByUser = new Map(event.votes.map((v) => [v.userId, v.choice]));
      const alreadySent = new Set(
        event.reminderLogs.map((l) => `${l.userId}:${l.kind}`),
      );

      for (const membership of event.team.memberships) {
        const user = membership.user;
        const vote = voteByUser.get(user.id);

        const kinds: ReminderKind[] = [];
        if (!vote) {
          // Inside the 2-day window only the 2d nudge goes out — an event
          // that first materializes late (short-notice creation, CSV import,
          // member joined) must not double-nudge with 7d AND 2d at once.
          if (within2d) kinds.push(ReminderKind.VOTE_2D);
          else if (within7d) kinds.push(ReminderKind.VOTE_7D);
        } else if (vote === VoteChoice.YES && within1d) {
          kinds.push(ReminderKind.INFO_1D);
        }
        // NO-voters get nothing (spec).

        for (const kind of kinds) {
          if (alreadySent.has(`${user.id}:${kind}`)) continue;
          const ok = await this.claim(event.id, user.id, kind);
          if (!ok) continue;
          try {
            await this.notifications.notify(user, {
              kind,
              clubName: event.team.club.name,
              teamName: event.team.name,
              opponent: event.opponent,
              kickoff: event.startsAt,
              url: `${this.webAppUrl}/clubs/${event.team.clubId}/teams/${event.teamId}/events/${event.id}`,
            });
            dispatched += 1;
          } catch (error) {
            this.logger.error(
              `Failed to send ${kind} reminder for event ${event.id} to user ${user.id}`,
              error instanceof Error ? error.stack : String(error),
            );
            // Release the claim so the next tick retries — otherwise a
            // transient delivery failure permanently swallows the reminder.
            await this.prisma.reminderLog
              .deleteMany({
                where: { eventId: event.id, userId: user.id, kind },
              })
              .catch(() => undefined);
          }
        }
      }
    }
    return dispatched;
  }

  /**
   * Atomically records that (event, user, kind) is being sent. Returns false
   * if another tick already claimed it (unique-constraint violation, P2002).
   */
  private async claim(
    eventId: string,
    userId: string,
    kind: ReminderKind,
  ): Promise<boolean> {
    try {
      await this.prisma.reminderLog.create({
        data: { eventId, userId, kind },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return false;
      }
      throw error;
    }
  }
}
