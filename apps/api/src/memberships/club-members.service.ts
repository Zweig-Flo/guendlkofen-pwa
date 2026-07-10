import { accessibleBy } from '@casl/prisma/runtime';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type AppAbility, toSubject } from '../casl/app-ability';
import { ClubsService } from '../clubs/clubs.service';
import type { ClubMembership, User } from '../generated/prisma/client';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateClubMemberDto } from './dto/create-club-member.dto';
import type { UpdateClubMemberDto } from './dto/update-club-member.dto';

type ClubMembershipWithUser = ClubMembership & { user: User };

@Injectable()
export class ClubMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clubsService: ClubsService,
  ) {}

  async findAllInClub(
    ability: AppAbility,
    clubId: string,
  ): Promise<ClubMembershipWithUser[]> {
    await this.clubsService.getClubForAbility(ability, clubId, 'read');
    // Scoped by the URL's clubId AND by CASL — isolation lives in the query.
    return this.prisma.clubMembership.findMany({
      where: {
        AND: [
          { clubId },
          accessibleBy(ability, 'read').ofType('ClubMembership'),
        ],
      },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async add(
    ability: AppAbility,
    clubId: string,
    dto: CreateClubMemberDto,
  ): Promise<ClubMembershipWithUser> {
    await this.clubsService.getClubForAbility(ability, clubId, 'read');
    if (
      ability.cannot(
        'create',
        toSubject('ClubMembership', {
          clubId,
          userId: dto.userId,
          role: dto.role,
        }),
      )
    ) {
      throw new ForbiddenException(
        'You are not allowed to add members to this club',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    try {
      return await this.prisma.clubMembership.create({
        data: { clubId, userId: dto.userId, role: dto.role },
        include: { user: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'The user is already a member of this club',
        );
      }
      throw error;
    }
  }

  async updateRole(
    ability: AppAbility,
    clubId: string,
    membershipId: string,
    dto: UpdateClubMemberDto,
  ): Promise<ClubMembershipWithUser> {
    const membership = await this.getMembershipInClubForAbility(
      ability,
      clubId,
      membershipId,
      'update',
    );
    return this.prisma.clubMembership.update({
      where: { id: membership.id },
      data: { role: dto.role },
      include: { user: true },
    });
  }

  async remove(
    ability: AppAbility,
    clubId: string,
    membershipId: string,
  ): Promise<ClubMembershipWithUser> {
    const membership = await this.getMembershipInClubForAbility(
      ability,
      clubId,
      membershipId,
      'delete',
    );
    return this.prisma.clubMembership.delete({
      where: { id: membership.id },
      include: { user: true },
    });
  }

  private async getMembershipInClubForAbility(
    ability: AppAbility,
    clubId: string,
    membershipId: string,
    action: 'update' | 'delete',
  ): Promise<ClubMembershipWithUser> {
    await this.clubsService.getClubForAbility(ability, clubId, 'read');
    const membership = await this.prisma.clubMembership.findFirst({
      where: { id: membershipId, clubId },
      include: { user: true },
    });
    if (!membership) {
      throw new NotFoundException('Membership not found in this club');
    }
    // Only who can manage memberships of this club may change roles / remove.
    if (ability.cannot(action, toSubject('ClubMembership', membership))) {
      throw new ForbiddenException(
        'You are not allowed to manage members of this club',
      );
    }
    return membership;
  }
}
