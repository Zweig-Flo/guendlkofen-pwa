import { Module } from '@nestjs/common';
import { CaslModule } from '../casl/casl.module';
import { ClubsModule } from '../clubs/clubs.module';
import { TeamsModule } from '../teams/teams.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { MeController } from './me.controller';
import { VotesService } from './votes.service';

@Module({
  imports: [CaslModule, ClubsModule, TeamsModule],
  controllers: [EventsController, MeController],
  providers: [EventsService, VotesService],
})
export class PlannerModule {}
