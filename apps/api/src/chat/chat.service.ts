import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type AppAbility, toSubject } from '../casl/app-ability';
import type { Team, User } from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeamsService } from '../teams/teams.service';
import { ChatCryptoService } from './chat-crypto.service';
import { ChatEvents } from './chat-events';
import { buildChatPush, previewText } from './chat-texts';
import { ChatMessageDto } from './dto/chat-message.dto';
import { ChatMessagePageDto } from './dto/chat-message-page.dto';
import {
  DEFAULT_MESSAGE_LIMIT,
  MAX_MESSAGE_LIMIT,
} from './dto/list-messages-query.dto';
import type { SendMessageDto } from './dto/send-message.dto';

// Flood control: at most FLOOD_MAX messages per user within FLOOD_WINDOW_MS.
const FLOOD_MAX = 10;
const FLOOD_WINDOW_MS = 10_000;
// Push throttle: at most one chat push per (user, team) per this interval.
const PUSH_THROTTLE_MS = 5 * 60_000;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  // In-memory, single-instance state (matches the presence/throttle design).
  private readonly floodLog = new Map<string, number[]>();
  private readonly lastPushAt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
    private readonly crypto: ChatCryptoService,
    private readonly events: ChatEvents,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  async list(
    ability: AppAbility,
    clubId: string,
    teamId: string,
    cursor?: string,
    limit: number = DEFAULT_MESSAGE_LIMIT,
  ): Promise<ChatMessagePageDto> {
    await this.teamsService.getTeamInClubForAbility(
      ability,
      clubId,
      teamId,
      'read',
    );
    this.assertCanAccess(ability, 'read', clubId, teamId);

    const take = Math.min(Math.max(limit, 1), MAX_MESSAGE_LIMIT);
    const messages = await this.prisma.chatMessage.findMany({
      where: { teamId },
      include: { author: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const page = new ChatMessagePageDto();
    page.messages = messages.map((message) =>
      ChatMessageDto.from(
        message,
        message.author,
        this.safeDecrypt(message.id, message.content),
      ),
    );
    page.nextCursor =
      messages.length === take ? messages[messages.length - 1].id : null;
    return page;
  }

  async send(
    ability: AppAbility,
    clubId: string,
    teamId: string,
    user: User,
    dto: SendMessageDto,
  ): Promise<ChatMessageDto> {
    const team = await this.teamsService.getTeamInClubForAbility(
      ability,
      clubId,
      teamId,
      'read',
    );
    this.assertCanAccess(ability, 'create', clubId, teamId);
    this.assertNotFlooding(user.id);

    const ciphertext = this.crypto.encrypt(dto.content);
    const message = await this.prisma.chatMessage.create({
      data: { teamId, authorId: user.id, content: ciphertext },
      include: { author: true },
    });

    const result = ChatMessageDto.from(message, message.author, dto.content);
    this.events.emitMessage(teamId, result);
    // Best-effort — never let a push failure break the send.
    await this.notifyOfflineMembers(clubId, team, user, dto.content);
    return result;
  }

  async remove(
    ability: AppAbility,
    clubId: string,
    teamId: string,
    messageId: string,
  ): Promise<void> {
    await this.teamsService.getTeamInClubForAbility(
      ability,
      clubId,
      teamId,
      'read',
    );
    const message = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, teamId },
    });
    if (!message) {
      throw new NotFoundException('Message not found in this team');
    }
    // Author deletes own; team/club admins delete any (CASL manage). The subject
    // carries both authorId and team.clubId so every matching rule can evaluate.
    const subject = toSubject('ChatMessage', {
      authorId: message.authorId,
      teamId,
      team: { clubId },
    });
    if (ability.cannot('delete', subject)) {
      throw new ForbiddenException(
        'You are not allowed to delete this message',
      );
    }
    await this.prisma.chatMessage.delete({ where: { id: messageId } });
    this.events.emitDeleted(teamId, messageId);
  }

  /**
   * The URL-scoped team read is club-wide, so the actual team-membership gate is
   * this CASL check on the ChatMessage subject (mirrors how the planner narrows
   * club-read down to team-scoped Event access).
   */
  private assertCanAccess(
    ability: AppAbility,
    action: 'read' | 'create',
    clubId: string,
    teamId: string,
  ): void {
    const subject = toSubject('ChatMessage', {
      teamId,
      team: { clubId },
    });
    if (ability.cannot(action, subject)) {
      throw new ForbiddenException('You are not a member of this team’s chat');
    }
  }

  private assertNotFlooding(userId: string): void {
    const now = Date.now();
    const recent = (this.floodLog.get(userId) ?? []).filter(
      (t) => now - t < FLOOD_WINDOW_MS,
    );
    if (recent.length >= FLOOD_MAX) {
      throw new HttpException(
        'You are sending messages too quickly. Please slow down.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.floodLog.set(userId, recent);
  }

  private safeDecrypt(messageId: string, content: string): string {
    try {
      return this.crypto.decrypt(content);
    } catch {
      // A row we cannot decrypt (key rotation gap / corruption) must not take
      // down the whole page — surface a placeholder and log for investigation.
      this.logger.error(`Failed to decrypt chat message ${messageId}`);
      return '';
    }
  }

  /**
   * Push to every team member who has NO live socket in the room, throttled to
   * one push per (user, team) per 5 minutes. Push-only: no email fallback.
   */
  private async notifyOfflineMembers(
    clubId: string,
    team: Team,
    author: User,
    plaintext: string,
  ): Promise<void> {
    try {
      const webAppUrl = this.config.get<string>('WEB_APP_URL') ?? '';
      const url = `${webAppUrl}/clubs/${clubId}/teams/${team.id}/chat`;
      const authorName = author.name ?? author.email ?? '';
      const preview = previewText(plaintext);

      const memberships = await this.prisma.teamMembership.findMany({
        where: { teamId: team.id },
        include: { user: true },
      });

      const now = Date.now();
      await Promise.all(
        memberships.map(async ({ user }) => {
          if (user.id === author.id) {
            return;
          }
          if (this.events.isUserInRoom(team.id, user.id)) {
            return;
          }
          const throttleKey = `${user.id}:${team.id}`;
          const last = this.lastPushAt.get(throttleKey);
          if (last !== undefined && now - last < PUSH_THROTTLE_MS) {
            return;
          }
          this.lastPushAt.set(throttleKey, now);

          const built = buildChatPush({
            locale: user.locale,
            teamName: team.name,
            authorName,
            content: preview,
          });
          await this.notifications.sendPushOnly(user, {
            title: built.title,
            body: built.body,
            url,
          });
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Chat push fan-out failed for team ${team.id}: ${String(error)}`,
      );
    }
  }
}
