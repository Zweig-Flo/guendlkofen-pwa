import { Badge, Group } from '@mantine/core'
import { useTranslation } from 'react-i18next'

/** Compact tally badges: N in / N out / N pending. */
export function VoteTally({ yesCount, noCount, notVotedCount }) {
  const { t } = useTranslation()
  return (
    <Group gap="xs" wrap="wrap">
      <Badge color="green" variant="light" radius="sm">
        {t('planner.tally.yes', { count: yesCount })}
      </Badge>
      <Badge color="red" variant="light" radius="sm">
        {t('planner.tally.no', { count: noCount })}
      </Badge>
      <Badge color="gray" variant="light" radius="sm">
        {t('planner.tally.notVoted', { count: notVotedCount })}
      </Badge>
    </Group>
  )
}
