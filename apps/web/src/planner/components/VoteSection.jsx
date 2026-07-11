import { useEventVote } from '../useEventVote'
import { VoteControls } from './VoteControls'
import { VoteTally } from './VoteTally'

/**
 * Owns a single useEventVote instance and feeds BOTH the buttons and the
 * tally from it, so optimistic vote flips move the counts instantly.
 * Also keeps the hook call unconditional for screens that early-return
 * while the event is still loading.
 */
export function VoteSection({ clubId, teamId, event, closed }) {
  const vote = useEventVote(clubId, teamId, event)

  return (
    <>
      <VoteControls closed={closed} vote={vote} />
      <VoteTally
        yesCount={vote.yesCount}
        noCount={vote.noCount}
        notVotedCount={vote.notVotedCount}
      />
    </>
  )
}
