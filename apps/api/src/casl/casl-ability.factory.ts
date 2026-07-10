import { AbilityBuilder } from '@casl/ability';
import { createPrismaAbility } from '@casl/prisma/runtime';
import { Injectable } from '@nestjs/common';
import type { User } from '../generated/prisma/client';
import { ClubRole, TeamRole } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AppAbility } from './app-ability';

@Injectable()
export class CaslAbilityFactory {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Builds the CASL ability for a user from their club and team memberships.
   *
   * - Super admins can manage everything (including creating clubs — nobody
   *   else can create clubs).
   * - Club admins manage their club (update, not create/delete — those stay
   *   with the super admin), its teams and all memberships inside the club.
   * - Members read their club, its teams and its memberships.
   * - Team admins update their team and manage its memberships (they cannot
   *   create or delete teams).
   * - Players get read access through their club membership.
   */
  async createForUser(user: User): Promise<AppAbility> {
    const { can, build } = new AbilityBuilder<AppAbility>(createPrismaAbility);

    if (user.isSuperAdmin) {
      can('manage', 'all');
      return build();
    }

    const [clubMemberships, teamMemberships] = await Promise.all([
      this.prisma.clubMembership.findMany({ where: { userId: user.id } }),
      this.prisma.teamMembership.findMany({ where: { userId: user.id } }),
    ]);

    // Every user can see and edit their own profile.
    can(['read', 'update'], 'User', { id: user.id });

    const memberClubIds = clubMemberships.map((m) => m.clubId);
    if (memberClubIds.length > 0) {
      can('read', 'Club', { id: { in: memberClubIds } });
      can('read', 'Team', { clubId: { in: memberClubIds } });
      can('read', 'ClubMembership', { clubId: { in: memberClubIds } });
      can('read', 'TeamMembership', {
        team: { is: { clubId: { in: memberClubIds } } },
      });
      // Fellow club members are visible (needed for member lists).
      can('read', 'User', {
        clubMemberships: { some: { clubId: { in: memberClubIds } } },
      });
    }

    const adminClubIds = clubMemberships
      .filter((m) => m.role === ClubRole.CLUB_ADMIN)
      .map((m) => m.clubId);
    if (adminClubIds.length > 0) {
      // Not 'manage': creating and deleting clubs is super-admin territory.
      can(['read', 'update'], 'Club', { id: { in: adminClubIds } });
      can('manage', 'Team', { clubId: { in: adminClubIds } });
      can('manage', 'ClubMembership', { clubId: { in: adminClubIds } });
      can('manage', 'TeamMembership', {
        team: { is: { clubId: { in: adminClubIds } } },
      });
    }

    const adminTeamIds = teamMemberships
      .filter((m) => m.role === TeamRole.TEAM_ADMIN)
      .map((m) => m.teamId);
    if (adminTeamIds.length > 0) {
      // Team admins may update their team but not create or delete teams.
      can(['read', 'update'], 'Team', { id: { in: adminTeamIds } });
      can('manage', 'TeamMembership', { teamId: { in: adminTeamIds } });
    }

    return build();
  }
}
