import {
  useAppControllerGetProfile,
  useClubMembersControllerFindAll,
  useTeamMembersControllerFindAll,
  ClubMembershipDtoRole,
  TeamMembershipDtoRole,
} from '@guendlkofen/api-client'

/** The current user's profile (local user record + super-admin flag). */
export function useMe() {
  return useAppControllerGetProfile({ query: { retry: false } })
}

/**
 * Permissions of the current user within a club. Combines the platform
 * super-admin flag with the caller's own club membership role.
 * UI hint only — the API enforces access regardless.
 */
export function useClubPermissions(clubId: string) {
  const { data: me } = useMe()
  const { data: members } = useClubMembersControllerFindAll(clubId)

  const isSuperAdmin = me?.isSuperAdmin ?? false
  const myMembership = members?.find((m) => m.userId === me?.id)
  const isClubAdmin = myMembership?.role === ClubMembershipDtoRole.CLUB_ADMIN

  const canManageClub = isSuperAdmin || isClubAdmin

  return {
    isSuperAdmin,
    isClubAdmin,
    /** Manage teams and members of this club. */
    canManageClub,
    /** Manage invitations of this club. */
    canManageInvitations: canManageClub,
  }
}

/**
 * Permissions of the current user within a specific team. Club admins and
 * super admins can manage any team; team admins can manage their own.
 */
export function useTeamPermissions(clubId: string, teamId: string) {
  const { data: me } = useMe()
  const club = useClubPermissions(clubId)
  const { data: teamMembers } = useTeamMembersControllerFindAll(clubId, teamId)

  const myTeamMembership = teamMembers?.find((m) => m.userId === me?.id)
  const isTeamAdmin = myTeamMembership?.role === TeamMembershipDtoRole.TEAM_ADMIN

  return {
    ...club,
    isTeamAdmin,
    /** Manage this team's members. */
    canManageTeam: club.canManageClub || isTeamAdmin,
  }
}
