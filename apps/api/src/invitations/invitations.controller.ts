import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOAuth2,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../casl/current-user.decorator';
import type { User } from '../generated/prisma/client';
import { ClubMembershipDto } from '../memberships/dto/club-membership.dto';
import { InvitationPreviewDto } from './dto/invitation-preview.dto';
import { RedeemInvitationDto } from './dto/redeem-invitation.dto';
import { InvitationsService } from './invitations.service';

@ApiTags('invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Get('preview')
  @Public()
  @ApiOperation({
    summary: 'Preview an invitation by token (no login required)',
    description:
      'Returns just enough to render the acceptance landing page: the club name, a masked email and a computed status. Never returns any ids or the token.',
  })
  @ApiOkResponse({ type: InvitationPreviewDto })
  async preview(@Query('token') token: string): Promise<InvitationPreviewDto> {
    const preview = await this.invitationsService.preview(token);
    const dto = new InvitationPreviewDto();
    dto.clubName = preview.clubName;
    dto.maskedEmail = preview.maskedEmail;
    dto.status = preview.status;
    return dto;
  }

  @Post('redeem')
  @ApiBearerAuth()
  @ApiOAuth2(['openid', 'profile', 'email'])
  @ApiOperation({
    summary: 'Redeem an invitation',
    description:
      'Accepts the invitation for the currently authenticated user. The logged-in account does NOT need to match the invited email address — the invitee may sign up with a different address. Creates/upgrades the club membership and any pre-assigned team memberships.',
  })
  @ApiOkResponse({ type: ClubMembershipDto })
  async redeem(
    @CurrentUser() user: User,
    @Body() dto: RedeemInvitationDto,
  ): Promise<ClubMembershipDto> {
    return ClubMembershipDto.fromMembership(
      await this.invitationsService.redeem(user, dto.token),
    );
  }
}
