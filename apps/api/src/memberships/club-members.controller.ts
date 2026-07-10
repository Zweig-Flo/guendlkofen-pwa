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
import { ClubMembersService } from './club-members.service';
import { ClubMembershipDto } from './dto/club-membership.dto';
import { CreateClubMemberDto } from './dto/create-club-member.dto';
import { UpdateClubMemberDto } from './dto/update-club-member.dto';

@ApiTags('club-members')
@ApiBearerAuth()
@ApiOAuth2(['openid', 'profile', 'email'])
@UseGuards(PoliciesGuard)
@Controller('clubs/:clubId/members')
export class ClubMembersController {
  constructor(private readonly clubMembersService: ClubMembersService) {}

  @Get()
  @ApiOkResponse({ type: ClubMembershipDto, isArray: true })
  async findAll(
    @CurrentAbility() ability: AppAbility,
    @Param('clubId') clubId: string,
  ): Promise<ClubMembershipDto[]> {
    const memberships = await this.clubMembersService.findAllInClub(
      ability,
      clubId,
    );
    return memberships.map((m) => ClubMembershipDto.fromMembership(m));
  }

  @Post()
  @CheckPolicies((ability: AppAbility) =>
    ability.can('create', 'ClubMembership'),
  )
  @ApiCreatedResponse({ type: ClubMembershipDto })
  async add(
    @CurrentAbility() ability: AppAbility,
    @Param('clubId') clubId: string,
    @Body() dto: CreateClubMemberDto,
  ): Promise<ClubMembershipDto> {
    return ClubMembershipDto.fromMembership(
      await this.clubMembersService.add(ability, clubId, dto),
    );
  }

  @Patch(':membershipId')
  @ApiOkResponse({ type: ClubMembershipDto })
  async updateRole(
    @CurrentAbility() ability: AppAbility,
    @Param('clubId') clubId: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateClubMemberDto,
  ): Promise<ClubMembershipDto> {
    return ClubMembershipDto.fromMembership(
      await this.clubMembersService.updateRole(
        ability,
        clubId,
        membershipId,
        dto,
      ),
    );
  }

  @Delete(':membershipId')
  @ApiOkResponse({ type: ClubMembershipDto })
  async remove(
    @CurrentAbility() ability: AppAbility,
    @Param('clubId') clubId: string,
    @Param('membershipId') membershipId: string,
  ): Promise<ClubMembershipDto> {
    return ClubMembershipDto.fromMembership(
      await this.clubMembersService.remove(ability, clubId, membershipId),
    );
  }
}
