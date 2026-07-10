import { Module } from '@nestjs/common';
import { CaslModule } from '../casl/casl.module';
import { ClubsModule } from '../clubs/clubs.module';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

@Module({
  imports: [CaslModule, ClubsModule],
  controllers: [TeamsController],
  providers: [TeamsService],
  exports: [TeamsService],
})
export class TeamsModule {}
