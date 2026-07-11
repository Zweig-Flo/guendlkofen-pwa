import { accessibleBy } from '@casl/prisma/runtime';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { type Action, type AppAbility, toSubject } from '../casl/app-ability';
import {
  EventSource,
  Prisma,
  type Event,
  type HomeAway,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TeamsService } from '../teams/teams.service';
import {
  CsvImportFatalError,
  DEFAULT_IMPORT_TIMEZONE,
  isValidTimeZone,
  parseEventsCsv,
  type CsvParseResult,
  type ParsedEventRow,
} from './csv-import';
import type { CreateEventDto } from './dto/create-event.dto';
import { EventDetailDto } from './dto/event-detail.dto';
import { EventDto } from './dto/event.dto';
import { ImportResultDto } from './dto/import-result.dto';
import type { ListEventsQueryDto } from './dto/list-events-query.dto';
import { MyUpcomingEventDto } from './dto/my-upcoming-event.dto';
import type { UpdateEventDto } from './dto/update-event.dto';
import { buildVoteSummary } from './vote-summary.util';

const MAX_IMPORT_BYTES = 1_000_000;
const MAX_IMPORT_ROWS = 500;
const ACCEPTED_MIME = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/octet-stream',
]);

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
  ) {}

  /**
   * Resolve an event within the team scope and assert the ability may perform
   * `action` on it. Mirrors TeamsService.getTeamInClubForAbility:
   * 404 for a team out of the club / an event out of the team, 403 if forbidden.
   */
  async getEventInTeamForAbility(
    ability: AppAbility,
    clubId: string,
    teamId: string,
    eventId: string,
    action: Action,
  ): Promise<Event> {
    await this.teamsService.getTeamInClubForAbility(
      ability,
      clubId,
      teamId,
      'read',
    );
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, teamId },
    });
    if (!event) {
      throw new NotFoundException('Event not found in this team');
    }
    if (ability.cannot(action, toSubject('Event', event))) {
      throw new ForbiddenException(
        'You are not allowed to perform this action on this event',
      );
    }
    return event;
  }

  async findAllInTeam(
    ability: AppAbility,
    clubId: string,
    teamId: string,
    userId: string,
    query: ListEventsQueryDto,
  ): Promise<EventDto[]> {
    await this.teamsService.getTeamInClubForAbility(
      ability,
      clubId,
      teamId,
      'read',
    );

    const startsAt: Prisma.DateTimeFilter = {};
    if (query.from) {
      startsAt.gte = new Date(query.from);
    }
    if (query.to) {
      startsAt.lte = new Date(query.to);
    }
    // Default hides past games unless includePast or an explicit `from` is set.
    if (!query.includePast && !query.from) {
      startsAt.gte = new Date();
    }

    const where: Prisma.EventWhereInput = {
      AND: [{ teamId }, accessibleBy(ability, 'read').ofType('Event')],
    };
    if (Object.keys(startsAt).length > 0) {
      where.startsAt = startsAt;
    }
    if (query.status) {
      where.status = query.status;
    }

    const [events, memberCount] = await Promise.all([
      this.prisma.event.findMany({
        where,
        include: { votes: true },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.teamMembership.count({ where: { teamId } }),
    ]);

    return events.map((event) =>
      EventDto.fromEntity(
        event,
        buildVoteSummary(event.votes, memberCount, userId),
      ),
    );
  }

  async create(
    ability: AppAbility,
    clubId: string,
    teamId: string,
    userId: string,
    dto: CreateEventDto,
  ): Promise<EventDto> {
    await this.teamsService.getTeamInClubForAbility(
      ability,
      clubId,
      teamId,
      'read',
    );
    if (ability.cannot('create', toSubject('Event', { teamId }))) {
      throw new ForbiddenException(
        'You are not allowed to create events for this team',
      );
    }
    const event = await this.prisma.event.create({
      data: {
        teamId,
        startsAt: new Date(dto.startsAt),
        opponent: dto.opponent,
        location: dto.location ?? null,
        homeAway: dto.homeAway,
        notes: dto.notes ?? null,
      },
    });
    const memberCount = await this.prisma.teamMembership.count({
      where: { teamId },
    });
    return EventDto.fromEntity(
      event,
      buildVoteSummary([], memberCount, userId),
    );
  }

  async findOne(
    ability: AppAbility,
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
  ): Promise<EventDetailDto> {
    await this.getEventInTeamForAbility(
      ability,
      clubId,
      teamId,
      eventId,
      'read',
    );
    const [event, memberCount] = await Promise.all([
      this.prisma.event.findFirstOrThrow({
        where: { id: eventId, teamId },
        include: { votes: true },
      }),
      this.prisma.teamMembership.count({ where: { teamId } }),
    ]);
    return EventDetailDto.fromEntityWithVotes(
      event,
      buildVoteSummary(event.votes, memberCount, userId),
    );
  }

  async update(
    ability: AppAbility,
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
    dto: UpdateEventDto,
  ): Promise<EventDto> {
    await this.getEventInTeamForAbility(
      ability,
      clubId,
      teamId,
      eventId,
      'update',
    );
    const data: Prisma.EventUpdateInput = {};
    if (dto.startsAt !== undefined) {
      data.startsAt = new Date(dto.startsAt);
    }
    if (dto.opponent !== undefined) {
      data.opponent = dto.opponent;
    }
    if (dto.location !== undefined) {
      data.location = dto.location ?? null;
    }
    if (dto.homeAway !== undefined) {
      data.homeAway = dto.homeAway;
    }
    if (dto.notes !== undefined) {
      data.notes = dto.notes ?? null;
    }
    if (dto.status !== undefined) {
      data.status = dto.status;
    }
    const [event, memberCount] = await Promise.all([
      this.prisma.event.update({
        where: { id: eventId },
        data,
        include: { votes: true },
      }),
      this.prisma.teamMembership.count({ where: { teamId } }),
    ]);
    return EventDto.fromEntity(
      event,
      buildVoteSummary(event.votes, memberCount, userId),
    );
  }

  async remove(
    ability: AppAbility,
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
  ): Promise<EventDto> {
    await this.getEventInTeamForAbility(
      ability,
      clubId,
      teamId,
      eventId,
      'delete',
    );
    const [event, memberCount] = await Promise.all([
      this.prisma.event.findFirstOrThrow({
        where: { id: eventId, teamId },
        include: { votes: true },
      }),
      this.prisma.teamMembership.count({ where: { teamId } }),
    ]);
    const summary = buildVoteSummary(event.votes, memberCount, userId);
    await this.prisma.event.delete({ where: { id: eventId } });
    return EventDto.fromEntity(event, summary);
  }

  async importCsv(
    ability: AppAbility,
    clubId: string,
    teamId: string,
    file: Express.Multer.File | undefined,
    timeZone?: string,
  ): Promise<ImportResultDto> {
    await this.teamsService.getTeamInClubForAbility(
      ability,
      clubId,
      teamId,
      'read',
    );
    if (ability.cannot('create', toSubject('Event', { teamId }))) {
      throw new ForbiddenException(
        'You are not allowed to import events for this team',
      );
    }
    if (!file) {
      throw new BadRequestException('import.error.noFile');
    }
    if (file.size > MAX_IMPORT_BYTES) {
      throw new PayloadTooLargeException('import.error.fileTooLarge');
    }
    const isCsv =
      ACCEPTED_MIME.has(file.mimetype) ||
      file.originalname.toLowerCase().endsWith('.csv');
    if (!isCsv) {
      throw new BadRequestException('import.error.notCsv');
    }

    // Rows are interpreted in the uploader's browser timezone (decision log:
    // PLANNER-DESIGN.md §6.7); invalid/missing zones fall back to Berlin.
    const zone =
      timeZone && isValidTimeZone(timeZone)
        ? timeZone
        : DEFAULT_IMPORT_TIMEZONE;

    let parsed: CsvParseResult;
    try {
      parsed = parseEventsCsv(file.buffer.toString('utf8'), zone);
    } catch (error) {
      if (error instanceof CsvImportFatalError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    if (parsed.totalRows > MAX_IMPORT_ROWS) {
      throw new BadRequestException('import.error.tooManyRows');
    }

    return this.upsertImportedRows(teamId, parsed.valid, {
      totalRows: parsed.totalRows,
      errors: parsed.errors,
    });
  }

  private async upsertImportedRows(
    teamId: string,
    rows: ParsedEventRow[],
    meta: Pick<ImportResultDto, 'totalRows' | 'errors'>,
  ): Promise<ImportResultDto> {
    const keys = rows.map((r) => r.importKey);
    const existing = await this.prisma.event.findMany({
      where: { teamId, importKey: { in: keys } },
    });
    const existingByKey = new Map(existing.map((e) => [e.importKey, e]));

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    // Tracks what a key resolves to within THIS run so in-file duplicates
    // (same date+opponent) classify against the pending write, not the DB.
    const seen = new Map<
      string,
      {
        startsAt: Date;
        opponent: string;
        location: string | null;
        homeAway: HomeAway;
        notes: string | null;
      }
    >();
    const ops: Prisma.PrismaPromise<Event>[] = [];

    for (const row of rows) {
      const data = {
        startsAt: row.startsAt,
        opponent: row.opponent,
        location: row.location,
        homeAway: row.homeAway,
        notes: row.notes,
      };
      const prior = seen.get(row.importKey) ?? existingByKey.get(row.importKey);
      if (!prior) {
        imported += 1;
      } else if (this.rowChanged(prior, data)) {
        updated += 1;
      } else {
        skipped += 1;
      }
      seen.set(row.importKey, data);

      ops.push(
        this.prisma.event.upsert({
          where: { teamId_importKey: { teamId, importKey: row.importKey } },
          create: {
            teamId,
            ...data,
            source: EventSource.IMPORT,
            importKey: row.importKey,
          },
          update: { ...data, source: EventSource.IMPORT },
        }),
      );
    }
    await this.prisma.$transaction(ops);

    const dto = new ImportResultDto();
    dto.totalRows = meta.totalRows;
    dto.imported = imported;
    dto.updated = updated;
    dto.skipped = skipped;
    dto.errorCount = meta.errors.length;
    dto.errors = meta.errors;
    return dto;
  }

  private rowChanged(
    prior: {
      startsAt: Date;
      opponent: string;
      location: string | null;
      homeAway: HomeAway;
      notes: string | null;
    },
    next: {
      startsAt: Date;
      opponent: string;
      location: string | null;
      homeAway: HomeAway;
      notes: string | null;
    },
  ): boolean {
    return (
      prior.startsAt.getTime() !== next.startsAt.getTime() ||
      prior.opponent !== next.opponent ||
      prior.location !== next.location ||
      prior.homeAway !== next.homeAway ||
      prior.notes !== next.notes
    );
  }

  async myUpcoming(
    ability: AppAbility,
    userId: string,
    days: number,
  ): Promise<MyUpcomingEventDto[]> {
    const now = new Date();
    const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    // Strictly membership-scoped (design doc §2): this is the caller's
    // personal vote feed, so club admins do NOT see teams they aren't on —
    // deliberately narrower than the read ability.
    const events = await this.prisma.event.findMany({
      where: {
        AND: [
          accessibleBy(ability, 'read').ofType('Event'),
          { team: { memberships: { some: { userId } } } },
          { startsAt: { gte: now, lte: until } },
        ],
      },
      include: {
        votes: true,
        team: { include: { _count: { select: { memberships: true } } } },
      },
      orderBy: { startsAt: 'asc' },
    });

    return events.map((event) =>
      MyUpcomingEventDto.fromEntity(
        event,
        buildVoteSummary(event.votes, event.team._count.memberships, userId),
      ),
    );
  }
}
