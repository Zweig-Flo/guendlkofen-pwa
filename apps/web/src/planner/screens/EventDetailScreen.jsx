import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Avatar,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Menu,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useTranslation } from 'react-i18next'
import {
  useEventsControllerFindOne,
  useEventsControllerListVotes,
  useEventsControllerRemove,
  useEventsControllerUpdate,
  useTeamMembersControllerFindAll,
} from '@guendlkofen/api-client'
import { formatDateTime, initials, invalidatePlanner, isPast } from '../lib'
import { useTeamAdmin } from '../useTeamAdmin'
import { HomeAwayBadge } from '../components/HomeAwayBadge'
import { VoteSection } from '../components/VoteSection'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { EventFormModal } from '../modals/EventFormModal'

function VoteGroup({ title, color, people }) {
  if (people.length === 0) return null
  return (
    <Stack gap="xs">
      <Text fw={600} fz="sm">
        {title} ({people.length})
      </Text>
      <Group gap="xs">
        {people.map((p) => (
          <Badge
            key={p.userId}
            size="lg"
            radius="xl"
            variant="light"
            color={color}
            leftSection={
              <Avatar size={18} radius="xl" color={color}>
                {initials(p.userName)}
              </Avatar>
            }
          >
            {p.userName ?? p.userId}
          </Badge>
        ))}
      </Group>
    </Stack>
  )
}

export function EventDetailScreen() {
  const { clubId, teamId, eventId } = useParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editOpen, edit] = useDisclosure(false)

  const isAdmin = useTeamAdmin(clubId, teamId)
  const { data: event, isLoading, isError, refetch } = useEventsControllerFindOne(
    clubId,
    teamId,
    eventId,
  )
  const { data: voteData } = useEventsControllerListVotes(clubId, teamId, eventId)
  const { data: members } = useTeamMembersControllerFindAll(clubId, teamId)
  const update = useEventsControllerUpdate()
  const remove = useEventsControllerRemove()

  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState onRetry={refetch} />
  if (!event) return <EmptyState message={t('common.error.loadFailed')} />

  const cancelled = event.status === 'CANCELLED'
  const closed = cancelled || isPast(event.startsAt)

  const votes = voteData?.votes ?? []
  const yes = votes.filter((v) => v.choice === 'YES')
  const no = votes.filter((v) => v.choice === 'NO')
  const votedIds = new Set(votes.map((v) => v.userId))
  const notVoted = (members ?? [])
    .filter((m) => !votedIds.has(m.userId))
    .map((m) => ({ userId: m.userId, userName: m.user?.name ?? m.user?.email }))

  async function setStatus(status, successKey) {
    try {
      await update.mutateAsync({ clubId, teamId, eventId, data: { status } })
      await invalidatePlanner(queryClient)
      notifications.show({ color: 'green', message: t(successKey) })
    } catch {
      notifications.show({ color: 'red', message: t('planner.form.failed') })
    }
  }

  async function handleDelete() {
    if (!window.confirm(t('planner.admin.deleteConfirm'))) return
    try {
      await remove.mutateAsync({ clubId, teamId, eventId })
      await invalidatePlanner(queryClient)
      notifications.show({ color: 'green', message: t('planner.admin.deleted') })
      navigate(`/clubs/${clubId}/teams/${teamId}`)
    } catch {
      notifications.show({ color: 'red', message: t('planner.form.failed') })
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Title order={2} lineClamp={2} td={cancelled ? 'line-through' : undefined}>
            {t('planner.versus')} {event.opponent}
          </Title>
          <Group gap="xs">
            <HomeAwayBadge value={event.homeAway} />
            {cancelled && (
              <Badge color="red" variant="filled" radius="sm">
                {t('planner.event.cancelled')}
              </Badge>
            )}
          </Group>
        </Stack>
        {isAdmin && (
          <Menu position="bottom-end">
            <Menu.Target>
              <Button variant="default" size="sm">
                ⋯
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={edit.open}>{t('planner.admin.edit')}</Menu.Item>
              {cancelled ? (
                <Menu.Item
                  onClick={() => setStatus('SCHEDULED', 'planner.admin.reactivated')}
                >
                  {t('planner.admin.reactivate')}
                </Menu.Item>
              ) : (
                <Menu.Item
                  onClick={() => setStatus('CANCELLED', 'planner.admin.cancelled')}
                >
                  {t('planner.admin.cancel')}
                </Menu.Item>
              )}
              <Menu.Divider />
              <Menu.Item color="red" onClick={handleDelete}>
                {t('planner.admin.delete')}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>

      <Card withBorder radius="md" padding="md">
        <Stack gap="xs">
          <Text fw={600}>{formatDateTime(event.startsAt, i18n.language)}</Text>
          {event.location && (
            <Text fz="sm">
              <Text span c="dimmed">
                {t('planner.event.location')}:{' '}
              </Text>
              {event.location}
            </Text>
          )}
          {event.notes && (
            <Text fz="sm">
              <Text span c="dimmed">
                {t('planner.event.notes')}:{' '}
              </Text>
              {event.notes}
            </Text>
          )}
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="md">
        <Stack gap="sm">
          <Text fw={600} fz="sm">
            {t('planner.vote.myVote')}
          </Text>
          <VoteSection
            clubId={clubId}
            teamId={teamId}
            event={event}
            closed={closed}
          />
        </Stack>
      </Card>

      <Stack gap="md">
        <Title order={3}>{t('planner.votes.title')}</Title>
        {votes.length === 0 && notVoted.length === 0 ? (
          <EmptyState message={t('planner.votes.empty')} />
        ) : (
          <>
            <VoteGroup title={t('planner.votes.yesGroup')} color="green" people={yes} />
            <VoteGroup title={t('planner.votes.noGroup')} color="red" people={no} />
            <Divider />
            <VoteGroup
              title={t('planner.votes.notVotedGroup')}
              color="gray"
              people={notVoted}
            />
          </>
        )}
      </Stack>

      <EventFormModal
        opened={editOpen}
        onClose={edit.close}
        clubId={clubId}
        teamId={teamId}
        event={event}
      />
    </Stack>
  )
}
