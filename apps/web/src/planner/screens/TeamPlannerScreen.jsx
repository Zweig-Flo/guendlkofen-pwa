import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Menu,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useTranslation } from 'react-i18next'
import {
  useEventsControllerFindAll,
  useTeamsControllerFindOne,
} from '@guendlkofen/api-client'
import { dayKey, formatDayHeading } from '../lib'
import { useTeamAdmin } from '../useTeamAdmin'
import { EventCard } from '../components/EventCard'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { EventFormModal } from '../modals/EventFormModal'
import { ImportModal } from '../modals/ImportModal'

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

export function TeamPlannerScreen() {
  const { clubId, teamId } = useParams()
  const { t, i18n } = useTranslation()
  const [showPast, setShowPast] = useState(false)
  const [formOpen, form] = useDisclosure(false)
  const [importOpen, importModal] = useDisclosure(false)

  const isAdmin = useTeamAdmin(clubId, teamId)
  const { data: team } = useTeamsControllerFindOne(clubId, teamId)
  const { data, isLoading, isError, refetch } = useEventsControllerFindAll(
    clubId,
    teamId,
    { includePast: showPast },
  )

  const groups = data ? groupByDay(data, i18n.language) : []

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={0} style={{ minWidth: 0 }}>
          <Title order={2} lineClamp={1}>
            {team?.name ?? t('planner.title')}
          </Title>
          {team?.sport && (
            <Text c="dimmed" fz="sm">
              {team.sport}
            </Text>
          )}
        </Stack>
        {isAdmin && (
          <Group gap="xs" wrap="nowrap">
            <Button size="sm" onClick={form.open}>
              {t('planner.admin.create')}
            </Button>
            <Menu position="bottom-end">
              <Menu.Target>
                <ActionIcon variant="default" size="lg" aria-label={t('planner.import.title')}>
                  ⋯
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={importModal.open}>
                  {t('planner.import.title')}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        )}
      </Group>

      <Switch
        checked={showPast}
        onChange={(e) => setShowPast(e.currentTarget.checked)}
        label={t('planner.showPast')}
      />

      {isLoading && <LoadingState />}
      {isError && <ErrorState onRetry={refetch} />}
      {!isLoading && !isError && groups.length === 0 && (
        <EmptyState message={t('planner.empty.team')} />
      )}

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
              clubId={clubId}
              teamId={teamId}
              event={event}
              showTime
            />
          ))}
        </Stack>
      ))}

      <EventFormModal
        opened={formOpen}
        onClose={form.close}
        clubId={clubId}
        teamId={teamId}
        event={null}
      />
      <ImportModal
        opened={importOpen}
        onClose={importModal.close}
        clubId={clubId}
        teamId={teamId}
      />
    </Stack>
  )
}
