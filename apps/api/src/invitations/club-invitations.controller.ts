import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { CurrentUser } from '../casl/current-user.decorator';
import { PoliciesGuard } from '../casl/policies.guard';
import type { User } from '../generated/prisma/client';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationDto } from './dto/invitation.dto';
import { InvitationsService } from './invitations.service';

@ApiTags('invitations')
@ApiBearerAuth()
@ApiOAuth2(['openid', 'profile', 'email'])
@UseGuards(PoliciesGuard)
@Controller('clubs/:clubId/invitations')
export class ClubInvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Get()
  @ApiOkResponse({ type: InvitationDto, isArray: true })
  async findAll(
    @CurrentAbility() ability: AppAbility,
    @Param('clubId') clubId: string,
  ): Promise<InvitationDto[]> {
    const invitations = await this.invitationsService.findAllInClub(
      ability,
      clubId,
    );
    return invitations.map((invitation) =>
      InvitationDto.fromInvitation(invitation),
    );
  }

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'Invitation'))
  @ApiCreatedResponse({ type: InvitationDto })
  async create(
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() user: User,
    @Param('clubId') clubId: string,
    @Body() dto: CreateInvitationDto,
  ): Promise<InvitationDto> {
    return InvitationDto.fromInvitation(
      await this.invitationsService.create(ability, clubId, dto, user),
    );
  }

  @Delete(':invitationId')
  @ApiOkResponse({ type: InvitationDto })
  async revoke(
    @CurrentAbility() ability: AppAbility,
    @Param('clubId') clubId: string,
    @Param('invitationId') invitationId: string,
  ): Promise<InvitationDto> {
    return InvitationDto.fromInvitation(
      await this.invitationsService.revoke(ability, clubId, invitationId),
    );
  }
}
