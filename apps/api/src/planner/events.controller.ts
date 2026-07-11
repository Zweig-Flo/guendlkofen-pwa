import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOAuth2,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AppAbility } from '../casl/app-ability';
import { CheckPolicies } from '../casl/check-policies.decorator';
import { CurrentAbility } from '../casl/current-ability.decorator';
import { CurrentUser } from '../casl/current-user.decorator';
import type { User } from '../generated/prisma/client';
import { PoliciesGuard } from '../casl/policies.guard';
import { CastVoteDto } from './dto/cast-vote.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { EventDetailDto } from './dto/event-detail.dto';
import { EventDto } from './dto/event.dto';
import { EventVotesDto } from './dto/event-votes.dto';
import { ImportResultDto } from './dto/import-result.dto';
import { ListEventsQueryDto } from './dto/list-events-query.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { VoteDto } from './dto/vote.dto';
import { EventsService } from './events.service';
import { VotesService } from './votes.service';

@ApiTags('planner')
@ApiBearerAuth()
@ApiOAuth2(['openid', 'profile', 'email'])
@UseGuards(PoliciesGuard)
@Controller('clubs/:clubId/teams/:teamId/events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly votesService: VotesService,
  ) {}

  @Get()
  @ApiOkResponse({ type: EventDto, isArray: true })
  async findAll(
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() user: User,
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Query() query: ListEventsQueryDto,
  ): Promise<EventDto[]> {
    return this.eventsService.findAllInTeam(
      ability,
      clubId,
      teamId,
      user.id,
      query,
    );
  }

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'Event'))
  @ApiCreatedResponse({ type: EventDto })
  async create(
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() user: User,
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Body() dto: CreateEventDto,
  ): Promise<EventDto> {
    return this.eventsService.create(ability, clubId, teamId, user.id, dto);
  }

  @Post('import')
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'Event'))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 1_000_000 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        timezone: {
          type: 'string',
          description:
            "IANA timezone the CSV's date/time cells are written in — send the uploader's browser zone (Intl.DateTimeFormat().resolvedOptions().timeZone). Missing or invalid values fall back to Europe/Berlin.",
          example: 'Europe/Berlin',
        },
      },
    },
  })
  @ApiOkResponse({ type: ImportResultDto })
  @HttpCode(200)
  async import(
    @CurrentAbility() ability: AppAbility,
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('timezone') timezone?: string,
  ): Promise<ImportResultDto> {
    return this.eventsService.importCsv(
      ability,
      clubId,
      teamId,
      file,
      timezone,
    );
  }

  @Get(':eventId')
  @ApiOkResponse({ type: EventDetailDto })
  async findOne(
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() user: User,
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
  ): Promise<EventDetailDto> {
    return this.eventsService.findOne(
      ability,
      clubId,
      teamId,
      eventId,
      user.id,
    );
  }

  @Patch(':eventId')
  @ApiOkResponse({ type: EventDto })
  async update(
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() user: User,
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateEventDto,
  ): Promise<EventDto> {
    return this.eventsService.update(
      ability,
      clubId,
      teamId,
      eventId,
      user.id,
      dto,
    );
  }

  @Delete(':eventId')
  @ApiOkResponse({ type: EventDto })
  async remove(
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() user: User,
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
  ): Promise<EventDto> {
    return this.eventsService.remove(ability, clubId, teamId, eventId, user.id);
  }

  @Put(':eventId/vote')
  @HttpCode(200)
  @ApiOkResponse({ type: VoteDto })
  async castVote(
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() user: User,
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Body() dto: CastVoteDto,
  ): Promise<VoteDto> {
    return this.votesService.castVote(
      ability,
      clubId,
      teamId,
      eventId,
      user.id,
      dto,
    );
  }

  @Delete(':eventId/vote')
  @HttpCode(204)
  @ApiNoContentResponse()
  async retractVote(
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() user: User,
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
  ): Promise<void> {
    await this.votesService.retractVote(
      ability,
      clubId,
      teamId,
      eventId,
      user.id,
    );
  }

  @Get(':eventId/votes')
  @ApiOkResponse({ type: EventVotesDto })
  async listVotes(
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() user: User,
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
  ): Promise<EventVotesDto> {
    return this.votesService.listVotes(
      ability,
      clubId,
      teamId,
      eventId,
      user.id,
    );
  }
}
