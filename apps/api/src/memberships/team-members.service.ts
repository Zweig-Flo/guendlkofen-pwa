import { accessibleBy } from '@casl/prisma/runtime';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type AppAbility, toSubject } from '../casl/app-ability';
import type { TeamMembership, User } from '../generated/prisma/client';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TeamsService } from '../teams/teams.service';
import type { CreateTeamMemberDto } from './dto/create-team-member.dto';
import type { UpdateTeamMemberDto } from './dto/update-team-member.dto';

type TeamMembershipWithUser = TeamMembership & { user: User };

@Injectable()
export class TeamMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
  ) {}

  async findAllInTeam(
    ability: AppAbility,
    clubId: string,
    teamId: string,
  ): Promise<TeamMembershipWithUser[]> {
    await this.teamsService.getTeamInClubForAbility(
      ability,
      clubId,
      teamId,
      'read',
    );
    // Scoped by the URL's teamId AND by CASL — isolation lives in the query.
    return this.prisma.teamMembership.findMany({
      where: {
        AND: [
          { teamId },
          accessibleBy(ability, 'read').ofType('TeamMembership'),
        ],
      },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async add(
    ability: AppAbility,
    clubId: string,
    teamId: string,
    dto: CreateTeamMemberDto,
  ): Promise<TeamMembershipWithUser> {
    const team = await this.teamsService.getTeamInClubForAbility(
      ability,
      clubId,
      teamId,
      'read',
    );
    if (
      ability.cannot(
        'create',
        toSubject('TeamMembership', {
          teamId,
          userId: dto.userId,
          role: dto.role,
          // Club-admin abilities condition on the team's club.
          team: { clubId: team.clubId },
        }),
      )
    ) {
      throw new ForbiddenException(
        'You are not allowed to add members to this team',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Players are always club members — enforce the invariant.
    const clubMembership = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId: dto.userId, clubId } },
    });
    if (!clubMembership) {
      throw new BadRequestException(
        'The user must be a member of the club before joining one of its teams',
      );
    }

    try {
      return await this.prisma.teamMembership.create({
        data: { teamId, userId: dto.userId, role: dto.role },
        include: { user: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'The user is already a member of this team',
        );
      }
      throw error;
    }
  }

  async updateRole(
    ability: AppAbility,
    clubId: string,
    teamId: string,
    membershipId: string,
    dto: UpdateTeamMemberDto,
  ): Promise<TeamMembershipWithUser> {
    const membership = await this.getMembershipInTeamForAbility(
      ability,
      clubId,
      teamId,
      membershipId,
      'update',
    );
    return this.prisma.teamMembership.update({
      where: { id: membership.id },
      data: { role: dto.role },
      include: { user: true },
    });
  }

  async remove(
    ability: AppAbility,
    clubId: string,
    teamId: string,
    membershipId: string,
  ): Promise<TeamMembershipWithUser> {
    const membership = await this.getMembershipInTeamForAbility(
      ability,
      clubId,
      teamId,
      membershipId,
      'delete',
    );
    return this.prisma.teamMembership.delete({
      where: { id: membership.id },
      include: { user: true },
    });
  }

  private async getMembershipInTeamForAbility(
    ability: AppAbility,
    clubId: string,
    teamId: string,
    membershipId: string,
    action: 'update' | 'delete',
  ): Promise<TeamMembershipWithUser> {
    const team = await this.teamsService.getTeamInClubForAbility(
      ability,
      clubId,
      teamId,
      'read',
    );
    const membership = await this.prisma.teamMembership.findFirst({
      where: { id: membershipId, teamId },
      include: { user: true },
    });
    if (!membership) {
      throw new NotFoundException('Membership not found in this team');
    }
    // Only who can manage memberships of this team scope may change roles.
    if (
      ability.cannot(
        action,
        toSubject('TeamMembership', {
          ...membership,
          team: { clubId: team.clubId },
        }),
      )
    ) {
      throw new ForbiddenException(
        'You are not allowed to manage members of this team',
      );
    }
    return membership;
  }
}
