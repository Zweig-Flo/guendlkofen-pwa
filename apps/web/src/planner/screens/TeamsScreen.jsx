import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Card, Group, Stack, Text, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import {
  useClubsControllerFindAll,
  useTeamsControllerFindAll,
} from '@guendlkofen/api-client'
import { EmptyState, ErrorState, LoadingState } from '../components/States'

function TeamRow({ team }) {
  const { t } = useTranslation()
  return (
    <Card
      withBorder
      radius="md"
      padding="md"
      component={Link}
      to={`/clubs/${team.clubId}/teams/${team.id}`}
    >
      <Group justify="space-between" wrap="nowrap">
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Text fw={600} fz="lg" lineClamp={1}>
            {team.name}
          </Text>
          <Group gap="xs">
            <Badge variant="light" radius="sm">
              {team.sport}
            </Badge>
            {team.league && (
              <Text c="dimmed" fz="sm">
                {team.league}
              </Text>
            )}
          </Group>
        </Stack>
        <Text c="dimmed" fz="sm">
          {t('planner.teams.open')} →
        </Text>
      </Group>
    </Card>
  )
}

/** Teams for one club; reports its team count so the parent can decide the
 *  global "no teams" empty state. */
function ClubTeams({ clubId, onCount }) {
  const { data, isSuccess } = useTeamsControllerFindAll(clubId)
  useEffect(() => {
    if (isSuccess) onCount(clubId, data.length)
  }, [isSuccess, data, clubId, onCount])
  if (!data || data.length === 0) return null
  return data.map((team) => <TeamRow key={team.id} team={team} />)
}

export function TeamsScreen() {
  const { t } = useTranslation()
  const { data: clubs, isLoading, isError, refetch } = useClubsControllerFindAll()
  const [counts, setCounts] = useState({})

  function handleCount(clubId, count) {
    setCounts((prev) =>
      prev[clubId] === count ? prev : { ...prev, [clubId]: count },
    )
  }

  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState onRetry={refetch} />

  const noClubs = !clubs || clubs.length === 0
  const loadedAll =
    !noClubs && clubs.every((c) => counts[c.id] !== undefined)
  const totalTeams = Object.values(counts).reduce((a, b) => a + b, 0)
  const showEmpty = noClubs || (loadedAll && totalTeams === 0)

  return (
    <Stack gap="md">
      <Title order={2}>{t('planner.teams.title')}</Title>
      {showEmpty ? (
        <EmptyState message={t('planner.empty.noTeams')} />
      ) : (
        clubs.map((club) => (
          <ClubTeams key={club.id} clubId={club.id} onCount={handleCount} />
        ))
      )}
    </Stack>
  )
}
