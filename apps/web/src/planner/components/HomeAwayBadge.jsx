import { Badge } from '@mantine/core'
import { useTranslation } from 'react-i18next'

const COLORS = { HOME: 'teal', AWAY: 'indigo', NEUTRAL: 'gray' }

export function HomeAwayBadge({ value }) {
  const { t } = useTranslation()
  return (
    <Badge color={COLORS[value] ?? 'gray'} variant="light" radius="sm">
      {t(`planner.event.homeAway.${value}`)}
    </Badge>
  )
}
