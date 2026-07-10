import { Module } from '@nestjs/common';
import { CaslModule } from '../casl/casl.module';
import { ClubsModule } from '../clubs/clubs.module';
import { TeamsModule } from '../teams/teams.module';
import { ClubMembersController } from './club-members.controller';
import { ClubMembersService } from './club-members.service';
import { TeamMembersController } from './team-members.controller';
import { TeamMembersService } from './team-members.service';

@Module({
  imports: [CaslModule, ClubsModule, TeamsModule],
  controllers: [ClubMembersController, TeamMembersController],
  providers: [ClubMembersService, TeamMembersService],
})
export class MembershipsModule {}
