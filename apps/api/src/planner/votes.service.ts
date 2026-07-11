import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { type AppAbility, toSubject } from '../casl/app-ability';
import {
  EventStatus,
  Prisma,
  type Event,
  type Vote,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CastVoteDto } from './dto/cast-vote.dto';
import { EventVotesDto, TeammateVoteDto } from './dto/event-votes.dto';
import { VoteDto } from './dto/vote.dto';
import { EventsService } from './events.service';
import { buildVoteSummary } from './vote-summary.util';

@Injectable()
export class VotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {}

  /**
   * Voting is only open on a SCHEDULED event before kickoff. After `startsAt`
   * the vote freezes (historical record); a cancelled event is read-only.
   */
  private assertVotingOpen(event: Event): void {
    if (event.status === EventStatus.CANCELLED) {
      throw new ConflictException('Voting is closed: the event was cancelled');
    }
    if (event.startsAt.getTime() <= Date.now()) {
      throw new ConflictException('Voting has closed for this event');
    }
  }

  async castVote(
    ability: AppAbility,
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
    dto: CastVoteDto,
  ): Promise<VoteDto> {
    const event = await this.eventsService.getEventInTeamForAbility(
      ability,
      clubId,
      teamId,
      eventId,
      'vote',
    );
    // Defence in depth: a player only ever writes their own vote row.
    if (ability.cannot('manage', toSubject('Vote', { userId }))) {
      throw new ForbiddenException('You may only cast your own vote');
    }
    this.assertVotingOpen(event);

    // Prisma upsert isn't atomic against a concurrent first-time insert of the
    // same (eventId, userId): both can pass the read and one insert loses with
    // P2002. Retry once as an update so the racer still gets a 200.
    let vote: Vote;
    try {
      vote = await this.prisma.vote.upsert({
        where: { eventId_userId: { eventId, userId } },
        create: { eventId, userId, choice: dto.choice },
        update: { choice: dto.choice },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        vote = await this.prisma.vote.update({
          where: { eventId_userId: { eventId, userId } },
          data: { choice: dto.choice },
        });
      } else {
        throw error;
      }
    }
    return VoteDto.fromEntity(vote);
  }

  async retractVote(
    ability: AppAbility,
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
  ): Promise<void> {
    const event = await this.eventsService.getEventInTeamForAbility(
      ability,
      clubId,
      teamId,
      eventId,
      'vote',
    );
    this.assertVotingOpen(event);
    // deleteMany so retracting a non-existent vote is a harmless no-op.
    await this.prisma.vote.deleteMany({ where: { eventId, userId } });
  }

  async listVotes(
    ability: AppAbility,
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
  ): Promise<EventVotesDto> {
    await this.eventsService.getEventInTeamForAbility(
      ability,
      clubId,
      teamId,
      eventId,
      'read',
    );
    const [votes, memberCount] = await Promise.all([
      this.prisma.vote.findMany({
        where: { eventId },
        include: { user: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.teamMembership.count({ where: { teamId } }),
    ]);

    const dto = new EventVotesDto();
    dto.eventId = eventId;
    dto.votes = votes.map((vote) => {
      const teammate = new TeammateVoteDto();
      teammate.userId = vote.userId;
      teammate.userName = vote.user.name;
      teammate.choice = vote.choice;
      return teammate;
    });
    dto.summary = buildVoteSummary(votes, memberCount, userId);
    return dto;
  }
}
