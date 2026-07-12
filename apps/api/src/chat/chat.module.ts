import { Module } from '@nestjs/common';
import { CaslModule } from '../casl/casl.module';
import { ClubsModule } from '../clubs/clubs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TeamsModule } from '../teams/teams.module';
import { UsersModule } from '../users/users.module';
import { ChatCryptoService } from './chat-crypto.service';
import { ChatEvents } from './chat-events';
import { ChatGateway } from './chat.gateway';
import { ChatMessagesController } from './chat-messages.controller';
import { ChatService } from './chat.service';
import { WsAuthService } from './ws-auth.service';

/**
 * Team chat: REST send/list/delete (ChatMessagesController + ChatService),
 * at-rest encryption (ChatCryptoService), realtime receive (ChatGateway +
 * ChatEvents), and socket handshake auth (WsAuthService).
 */
@Module({
  imports: [
    CaslModule,
    ClubsModule,
    TeamsModule,
    UsersModule,
    NotificationsModule,
  ],
  controllers: [ChatMessagesController],
  providers: [
    ChatCryptoService,
    ChatService,
    ChatEvents,
    ChatGateway,
    WsAuthService,
  ],
})
export class ChatModule {}
