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
import { CreateTeamDto } from './dto/create-team.dto';
import { TeamDto } from './dto/team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { TeamsService } from './teams.service';

@ApiTags('teams')
@ApiBearerAuth()
@ApiOAuth2(['openid', 'profile', 'email'])
@UseGuards(PoliciesGuard)
@Controller('clubs/:clubId/teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  @ApiOkResponse({ type: TeamDto, isArray: true })
  async findAll(
    @CurrentAbility() ability: AppAbility,
    @Param('clubId') clubId: string,
  ): Promise<TeamDto[]> {
    const teams = await this.teamsService.findAllInClub(ability, clubId);
    return teams.map((team) => TeamDto.fromTeam(team));
  }

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'Team'))
  @ApiCreatedResponse({ type: TeamDto })
  async create(
    @CurrentAbility() ability: AppAbility,
    @Param('clubId') clubId: string,
    @Body() dto: CreateTeamDto,
  ): Promise<TeamDto> {
    return TeamDto.fromTeam(
      await this.teamsService.create(ability, clubId, dto),
    );
  }

  @Get(':teamId')
  @ApiOkResponse({ type: TeamDto })
  async findOne(
    @CurrentAbility() ability: AppAbility,
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
  ): Promise<TeamDto> {
    return TeamDto.fromTeam(
      await this.teamsService.getTeamInClubForAbility(
        ability,
        clubId,
        teamId,
        'read',
      ),
    );
  }

  @Patch(':teamId')
  @ApiOkResponse({ type: TeamDto })
  async update(
    @CurrentAbility() ability: AppAbility,
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Body() dto: UpdateTeamDto,
  ): Promise<TeamDto> {
    return TeamDto.fromTeam(
      await this.teamsService.update(ability, clubId, teamId, dto),
    );
  }

  @Delete(':teamId')
  @ApiOkResponse({ type: TeamDto })
  async remove(
    @CurrentAbility() ability: AppAbility,
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
  ): Promise<TeamDto> {
    return TeamDto.fromTeam(
      await this.teamsService.remove(ability, clubId, teamId),
    );
  }
}
