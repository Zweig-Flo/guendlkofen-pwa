import { Logger } from '@nestjs/common';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { type AppAbility, toSubject } from '../casl/app-ability';
import { CaslAbilityFactory } from '../casl/casl-ability.factory';
import type { User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChatEvents, roomForTeam } from './chat-events';
import { WsAuthService } from './ws-auth.service';

interface JoinPayload {
  clubId: string;
  teamId: string;
}
interface LeavePayload {
  teamId: string;
}
interface TypingPayload {
  teamId: string;
}
interface Ack {
  ok?: true;
  error?: string;
}

/** Per-socket state we attach after a successful handshake. */
interface SocketData {
  user?: User;
  ability?: AppAbility;
}

/**
 * Realtime chat surface: authenticated room join/leave, ephemeral typing
 * broadcast, and the outbound `chat:message` / `chat:message:deleted` events
 * (emitted by ChatService through {@link ChatEvents}). All mutations still go
 * through REST — this gateway is read-side only.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly wsAuth: WsAuthService,
    private readonly events: ChatEvents,
    private readonly abilityFactory: CaslAbilityFactory,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server): void {
    this.events.setServer(server);
  }

  async handleConnection(client: Socket): Promise<void> {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      this.bearerFromHeader(client);
    try {
      const user = await this.wsAuth.verifyAndProvision(token);
      const data = client.data as SocketData;
      data.user = user;
      data.ability = await this.abilityFactory.createForUser(user);
    } catch {
      // Never leak why to the client; just refuse the socket.
      this.logger.debug(`Rejected unauthenticated socket ${client.id}`);
      client.emit('chat:error', { message: 'unauthorized' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.events.removeSocket(client.id);
  }

  @SubscribeMessage('chat:join')
  async onJoin(client: Socket, payload: JoinPayload): Promise<Ack> {
    const data = client.data as SocketData;
    if (!data.user || !data.ability) {
      return { error: 'unauthorized' };
    }
    if (
      !this.isValidPayload(payload?.clubId) ||
      !this.isValidPayload(payload?.teamId)
    ) {
      return { error: 'bad_request' };
    }

    const team = await this.prisma.team.findFirst({
      where: { id: payload.teamId, clubId: payload.clubId },
    });
    if (!team) {
      return { error: 'not_found' };
    }
    const subject = toSubject('ChatMessage', {
      teamId: team.id,
      team: { clubId: team.clubId },
    });
    if (data.ability.cannot('read', subject)) {
      return { error: 'forbidden' };
    }

    await client.join(roomForTeam(team.id));
    this.events.registerJoin(team.id, data.user.id, client.id);
    return { ok: true };
  }

  @SubscribeMessage('chat:leave')
  async onLeave(client: Socket, payload: LeavePayload): Promise<Ack> {
    const data = client.data as SocketData;
    if (!data.user || !this.isValidPayload(payload?.teamId)) {
      return { error: 'bad_request' };
    }
    await client.leave(roomForTeam(payload.teamId));
    this.events.registerLeave(payload.teamId, data.user.id, client.id);
    return { ok: true };
  }

  @SubscribeMessage('chat:typing')
  onTyping(client: Socket, payload: TypingPayload): void {
    const data = client.data as SocketData;
    if (!data.user || !this.isValidPayload(payload?.teamId)) {
      return;
    }
    const room = roomForTeam(payload.teamId);
    // Only relay if this socket actually joined the room (prevents spraying
    // typing events into rooms the caller has no membership in).
    if (!client.rooms.has(room)) {
      return;
    }
    client.to(room).emit('chat:typing', {
      teamId: payload.teamId,
      userId: data.user.id,
      name: data.user.name,
    });
  }

  private bearerFromHeader(client: Socket): string | undefined {
    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length);
    }
    return undefined;
  }

  private isValidPayload(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
  }
}
