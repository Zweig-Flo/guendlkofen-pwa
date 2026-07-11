import {
  useAppControllerGetProfile,
  useTeamMembersControllerFindAll,
} from '@guendlkofen/api-client'

/**
 * Whether the current user may manage a team's events (create/edit/cancel/
 * delete + CSV import). True for platform super admins and members whose team
 * role is TEAM_ADMIN. The API is the real gate — this only drives which
 * controls are shown.
 */
export function useTeamAdmin(clubId, teamId) {
  const { data: me } = useAppControllerGetProfile()
  const { data: members } = useTeamMembersControllerFindAll(clubId, teamId, {
    query: { enabled: !!clubId && !!teamId },
  })

  if (me?.isSuperAdmin) return true
  const mine = members?.find((m) => m.userId === me?.id)
  return mine?.role === 'TEAM_ADMIN'
}
