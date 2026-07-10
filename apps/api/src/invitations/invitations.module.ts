import { Module } from '@nestjs/common';
import { CaslModule } from '../casl/casl.module';
import { ClubsModule } from '../clubs/clubs.module';
import { EmailModule } from '../email/email.module';
import { ClubInvitationsController } from './club-invitations.controller';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

@Module({
  imports: [CaslModule, ClubsModule, EmailModule],
  controllers: [ClubInvitationsController, InvitationsController],
  providers: [InvitationsService],
})
export class InvitationsModule {}
