import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOAuth2,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AppAbility } from '../casl/app-ability';
import { CurrentAbility } from '../casl/current-ability.decorator';
import { CurrentUser } from '../casl/current-user.decorator';
import type { User } from '../generated/prisma/client';
import { PoliciesGuard } from '../casl/policies.guard';
import { MyUpcomingEventDto } from './dto/my-upcoming-event.dto';
import { MyUpcomingQueryDto } from './dto/my-upcoming-query.dto';
import { EventsService } from './events.service';

/**
 * Cross-team aggregation for the PWA home screen. Lives at the root (outside
 * the club nesting) because it spans every team the caller belongs to.
 */
@ApiTags('planner')
@ApiBearerAuth()
@ApiOAuth2(['openid', 'profile', 'email'])
@UseGuards(PoliciesGuard)
@Controller('me')
export class MeController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('upcoming-events')
  @ApiOkResponse({ type: MyUpcomingEventDto, isArray: true })
  async upcomingEvents(
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() user: User,
    @Query() query: MyUpcomingQueryDto,
  ): Promise<MyUpcomingEventDto[]> {
    return this.eventsService.myUpcoming(ability, user.id, query.days ?? 30);
  }
}
