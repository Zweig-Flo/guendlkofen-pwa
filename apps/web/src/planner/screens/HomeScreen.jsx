import { Box, Stack, Text, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { useMeControllerUpcomingEvents } from '@guendlkofen/api-client'
import { dayKey, formatDayHeading } from '../lib'
import { EventCard } from '../components/EventCard'
import { EmptyState, ErrorState, LoadingState } from '../components/States'

/** Group a sorted event array into [{ key, label, events }] by local day. */
function groupByDay(events, lang) {
  const groups = []
  const index = new Map()
  for (const event of events) {
    const key = dayKey(event.startsAt)
    let group = index.get(key)
    if (!group) {
      group = { key, label: formatDayHeading(event.startsAt, lang), events: [] }
      index.set(key, group)
      groups.push(group)
    }
    group.events.push(event)
  }
  return groups
}

export function HomeScreen() {
  const { t, i18n } = useTranslation()
  const { data, isLoading, isError, refetch } = useMeControllerUpcomingEvents()

  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState onRetry={refetch} />
  if (!data || data.length === 0) {
    return (
      <Stack>
        <Title order={2}>{t('planner.myGames.title')}</Title>
        <EmptyState message={t('planner.empty.upcoming')} />
      </Stack>
    )
  }

  const groups = groupByDay(data, i18n.language)

  return (
    <Stack gap="lg">
      <Title order={2}>{t('planner.myGames.title')}</Title>
      {groups.map((group) => (
        <Stack key={group.key} gap="sm">
          <Box
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 2,
              background: 'var(--mantine-color-body)',
              paddingBlock: 4,
            }}
          >
            <Text fw={600} c="dimmed" tt="capitalize">
              {group.label}
            </Text>
          </Box>
          {group.events.map((event) => (
            <EventCard
              key={event.id}
              clubId={event.clubId}
              teamId={event.teamId}
              event={event}
              teamName={event.team?.name}
              showTime
            />
          ))}
        </Stack>
      ))}
    </Stack>
  )
}
