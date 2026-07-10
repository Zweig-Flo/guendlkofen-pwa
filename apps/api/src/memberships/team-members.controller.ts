import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOAuth2,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AppAbility } from '../casl/app-ability';
import { CheckPolicies } from '../casl/check-policies.decorator';
import { CurrentAbility } from '../casl/current-ability.decorator';
import { PoliciesGuard } from '../casl/policies.guard';
import { CreateTeamMemberDto } from './dto/create-team-member.dto';
import { TeamMembershipDto } from './dto/team-membership.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';
import { TeamMembersService } from './team-members.service';

@ApiTags('team-members')
@ApiBearerAuth()
@ApiOAuth2(['openid', 'profile', 'email'])
@UseGuards(PoliciesGuard)
@Controller('clubs/:clubId/teams/:teamId/members')
export class TeamMembersController {
  constructor(private readonly teamMembersService: TeamMembersService) {}

  @Get()
  @ApiOkResponse({ type: TeamMembershipDto, isArray: true })
  async findAll(
    @CurrentAbility() ability: AppAbility,
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
  ): Promise<TeamMembershipDto[]> {
    const memberships = await this.teamMembersService.findAllInTeam(
      ability,
      clubId,
      teamId,
    );
    return memberships.map((m) => TeamMembershipDto.fromMembership(m));
  }

  @Post()
  @CheckPolicies((ability: AppAbility) =>
    ability.can('create', 'TeamMembership'),
  )
  @ApiCreatedResponse({ type: TeamMembershipDto })
  async add(
    @CurrentAbility() ability: AppAbility,
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Body() dto: CreateTeamMemberDto,
  ): Promise<TeamMembershipDto> {
    return TeamMembershipDto.fromMembership(
      await this.teamMembersService.add(ability, clubId, teamId, dto),
    );
  }

  @Patch(':membershipId')
  @ApiOkResponse({ type: TeamMembershipDto })
  async updateRole(
    @CurrentAbility() ability: AppAbility,
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateTeamMemberDto,
  ): Promise<TeamMembershipDto> {
    return TeamMembershipDto.fromMembership(
      await this.teamMembersService.updateRole(
        ability,
        clubId,
        teamId,
        membershipId,
        dto,
      ),
    );
  }

  @Delete(':membershipId')
  @ApiOkResponse({ type: TeamMembershipDto })
  async remove(
    @CurrentAbility() ability: AppAbility,
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('membershipId') membershipId: string,
  ): Promise<TeamMembershipDto> {
    return TeamMembershipDto.fromMembership(
      await this.teamMembersService.remove(
        ability,
        clubId,
        teamId,
        membershipId,
      ),
    );
  }
}
