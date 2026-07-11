import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { notifications } from '@mantine/notifications'
import {
  useEventsControllerCastVote,
  useEventsControllerRetractVote,
} from '@guendlkofen/api-client'
import { invalidatePlanner } from './lib'

/**
 * Optimistic YES/NO voting for a single event.
 *
 * Tapping the current vote again retracts it (back to "not voted"). The tally
 * shown to the user is derived from the server summary plus the optimistic
 * delta, so counts move instantly; on error we roll back and toast; on success
 * we invalidate all planner queries and drop the optimistic overlay once the
 * refetch has settled.
 */
export function useEventVote(clubId, teamId, event) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const cast = useEventsControllerCastVote()
  const retract = useEventsControllerRetractVote()

  // undefined => show server value; otherwise 'YES' | 'NO' | null (retracted)
  const [optimistic, setOptimistic] = useState(undefined)
  const [pendingChoice, setPendingChoice] = useState(null)

  const summary = event.summary
  const serverVote = summary.myVote ?? null
  const myVote = optimistic === undefined ? serverVote : optimistic

  let yesCount = summary.yesCount
  let noCount = summary.noCount
  let notVotedCount = summary.notVotedCount
  if (myVote !== serverVote) {
    if (serverVote === 'YES') yesCount -= 1
    else if (serverVote === 'NO') noCount -= 1
    else notVotedCount -= 1
    if (myVote === 'YES') yesCount += 1
    else if (myVote === 'NO') noCount += 1
    else notVotedCount += 1
  }

  async function choose(choice) {
    if (pendingChoice) return
    const next = myVote === choice ? null : choice
    setOptimistic(next)
    setPendingChoice(choice)
    try {
      if (next === null) {
        await retract.mutateAsync({ clubId, teamId, eventId: event.id })
      } else {
        await cast.mutateAsync({
          clubId,
          teamId,
          eventId: event.id,
          data: { choice: next },
        })
      }
      await invalidatePlanner(queryClient)
      setOptimistic(undefined)
    } catch {
      setOptimistic(undefined) // roll back to the untouched server value
      notifications.show({
        color: 'red',
        title: t('common.error.loadFailed'),
        message: t('planner.vote.failed'),
      })
    } finally {
      setPendingChoice(null)
    }
  }

  return {
    myVote,
    yesCount,
    noCount,
    notVotedCount,
    pendingChoice,
    choose,
  }
}
