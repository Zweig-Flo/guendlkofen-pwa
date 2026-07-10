import { accessibleBy } from '@casl/prisma/runtime';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Action, type AppAbility, toSubject } from '../casl/app-ability';
import { ClubsService } from '../clubs/clubs.service';
import { Prisma, type Team } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTeamDto } from './dto/create-team.dto';
import type { UpdateTeamDto } from './dto/update-team.dto';

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clubsService: ClubsService,
  ) {}

  async findAllInClub(ability: AppAbility, clubId: string): Promise<Team[]> {
    await this.clubsService.getClubForAbility(ability, clubId, 'read');
    // Scoped by the URL's clubId AND by CASL — isolation lives in the query.
    return this.prisma.team.findMany({
      where: {
        AND: [{ clubId }, accessibleBy(ability, 'read').ofType('Team')],
      },
      orderBy: [{ sport: 'asc' }, { rank: 'asc' }],
    });
  }

  async create(
    ability: AppAbility,
    clubId: string,
    dto: CreateTeamDto,
  ): Promise<Team> {
    await this.clubsService.getClubForAbility(ability, clubId, 'read');
    if (ability.cannot('create', toSubject('Team', { ...dto, clubId }))) {
      throw new ForbiddenException(
        'You are not allowed to create teams in this club',
      );
    }
    try {
      return await this.prisma.team.create({
        data: { ...dto, clubId },
      });
    } catch (error) {
      throw this.mapUniqueRankViolation(error);
    }
  }

  /**
   * Loads a team within the club scope and asserts the ability may perform
   * `action` on it. 404 if the team is not in this club, 403 if forbidden.
   * Also used by the team-members service to resolve the team scope.
   */
  async getTeamInClubForAbility(
    ability: AppAbility,
    clubId: string,
    teamId: string,
    action: Action,
  ): Promise<Team> {
    await this.clubsService.getClubForAbility(ability, clubId, 'read');
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, clubId },
    });
    if (!team) {
      throw new NotFoundException('Team not found in this club');
    }
    if (ability.cannot(action, toSubject('Team', team))) {
      throw new ForbiddenException(
        'You are not allowed to perform this action on this team',
      );
    }
    return team;
  }

  async update(
    ability: AppAbility,
    clubId: string,
    teamId: string,
    dto: UpdateTeamDto,
  ): Promise<Team> {
    await this.getTeamInClubForAbility(ability, clubId, teamId, 'update');
    try {
      return await this.prisma.team.update({
        where: { id: teamId },
        data: dto,
      });
    } catch (error) {
      throw this.mapUniqueRankViolation(error);
    }
  }

  async remove(
    ability: AppAbility,
    clubId: string,
    teamId: string,
  ): Promise<Team> {
    await this.getTeamInClubForAbility(ability, clubId, teamId, 'delete');
    return this.prisma.team.delete({ where: { id: teamId } });
  }

  private mapUniqueRankViolation(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException(
        'A team with this sport and rank already exists in this club',
      );
    }
    return error;
  }
}
