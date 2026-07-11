import { Link } from 'react-router-dom'
import { Badge, Card, Group, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { formatDateTime, formatTime, isPast } from '../lib'
import { useEventVote } from '../useEventVote'
import { HomeAwayBadge } from './HomeAwayBadge'
import { VoteControls } from './VoteControls'
import { VoteTally } from './VoteTally'

/**
 * One game as a full-width mobile card: opponent + meta, home/away badge,
 * YES/NO vote controls and a live tally. Used on both the Home ("my games")
 * and Team planner screens. `teamName` renders a team chip on the Home screen.
 * `showTime` shows only the kickoff time when the card already sits under a
 * day heading, otherwise the full date + time.
 */
export function EventCard({ clubId, teamId, event, teamName, showTime = false }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const vote = useEventVote(clubId, teamId, event)

  const cancelled = event.status === 'CANCELLED'
  const closed = cancelled || isPast(event.startsAt)

  return (
    <Card
      withBorder
      radius="md"
      padding="md"
      component={Link}
      to={`/clubs/${clubId}/teams/${teamId}/events/${event.id}`}
      style={{ opacity: cancelled ? 0.6 : 1 }}
    >
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={2} style={{ minWidth: 0 }}>
            {teamName && (
              <Badge variant="light" radius="sm" color="gray">
                {teamName}
              </Badge>
            )}
            <Text
              fw={600}
              fz="lg"
              lineClamp={2}
              td={cancelled ? 'line-through' : undefined}
            >
              {t('planner.versus')} {event.opponent}
            </Text>
            <Text c="dimmed" fz="sm">
              {showTime
                ? formatTime(event.startsAt, lang)
                : formatDateTime(event.startsAt, lang)}
              {event.location ? ` · ${event.location}` : ''}
            </Text>
          </Stack>
          <Stack gap={4} align="flex-end">
            <HomeAwayBadge value={event.homeAway} />
            {cancelled && (
              <Badge color="red" variant="filled" radius="sm">
                {t('planner.event.cancelled')}
              </Badge>
            )}
          </Stack>
        </Group>

        <VoteTally
          yesCount={vote.yesCount}
          noCount={vote.noCount}
          notVotedCount={vote.notVotedCount}
        />

        {/* stop card navigation when tapping the vote buttons */}
        <div
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
        >
          <VoteControls closed={closed} vote={vote} />
        </div>
      </Stack>
    </Card>
  )
}
