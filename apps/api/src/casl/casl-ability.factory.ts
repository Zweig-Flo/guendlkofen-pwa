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

    // The planner is stricter than the club-wide read: events and votes are
    // visible only to members OF THE TEAM, not to every club member. So the
    // Event/Vote abilities key off team memberships, never off memberClubIds.
    const memberTeamIds = teamMemberships.map((m) => m.teamId);
    if (memberTeamIds.length > 0) {
      // Players (and admins) read their teams' events and cast/change their vote.
      can('read', 'Event', { teamId: { in: memberTeamIds } });
      can('vote', 'Event', { teamId: { in: memberTeamIds } });
      // Transparency: teammates see each other's votes on their team's events.
      can('read', 'Vote', {
        event: { is: { teamId: { in: memberTeamIds } } },
      });
      // A player only ever writes their own vote row.
      can('manage', 'Vote', { userId: user.id });

      // Team members read and post chat in their teams. Deleting is stricter:
      // only your own messages (moderation for admins is added below).
      can('read', 'ChatMessage', { teamId: { in: memberTeamIds } });
      can('create', 'ChatMessage', { teamId: { in: memberTeamIds } });
      can('delete', 'ChatMessage', { authorId: user.id });
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
      // Club admins manage the invitations of their clubs; members get none.
      can('manage', 'Invitation', { clubId: { in: adminClubIds } });
      // Club admins run the planner for every team of their club.
      can('manage', 'Event', {
        team: { is: { clubId: { in: adminClubIds } } },
      });
      can('read', 'Vote', {
        event: { is: { team: { is: { clubId: { in: adminClubIds } } } } },
      });
      // Club admins moderate (read + delete any) chat across their club's teams.
      can('manage', 'ChatMessage', {
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
      // Team admins fully manage their team's planner (create/edit/cancel/delete
      // events, import) and read every teammate's vote.
      can('manage', 'Event', { teamId: { in: adminTeamIds } });
      can('read', 'Vote', {
        event: { is: { teamId: { in: adminTeamIds } } },
      });
      // Team admins moderate (read + delete any) chat of their teams.
      can('manage', 'ChatMessage', { teamId: { in: adminTeamIds } });
    }

    return build();
  }
}
