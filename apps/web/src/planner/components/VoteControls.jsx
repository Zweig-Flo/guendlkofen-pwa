import { Button, Group, Tooltip } from '@mantine/core'
import { useTranslation } from 'react-i18next'

/**
 * Two large YES/NO tap targets with optimistic feedback. When `closed`
 * (past kickoff or cancelled) the buttons are disabled with a tooltip.
 * `vote` is a useEventVote instance owned by the parent — sharing one instance
 * keeps the adjacent VoteTally in sync with the optimistic state.
 */
export function VoteControls({ closed, vote }) {
  const { t } = useTranslation()
  const v = vote

  const button = (choice, color, label) => {
    const active = v.myVote === choice
    return (
      <Button
        flex={1}
        size="md"
        radius="xl"
        color={color}
        variant={active ? 'filled' : 'light'}
        loading={v.pendingChoice === choice}
        disabled={closed || (!!v.pendingChoice && v.pendingChoice !== choice)}
        onClick={() => v.choose(choice)}
        styles={{ root: { minHeight: 44 } }}
      >
        {label}
      </Button>
    )
  }

  const group = (
    <Group grow gap="sm" wrap="nowrap">
      {button('YES', 'green', t('planner.vote.yes'))}
      {button('NO', 'red', t('planner.vote.no'))}
    </Group>
  )

  if (!closed) return group
  return (
    <Tooltip label={t('planner.vote.closed')} events={{ hover: true, focus: true, touch: true }}>
      {group}
    </Tooltip>
  )
}
