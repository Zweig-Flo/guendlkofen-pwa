import { VoteChoice } from '../generated/prisma/client';
import type { VoteSummaryDto } from './dto/vote-summary.dto';

/**
 * Build the vote tally embedded in event responses. `notVotedCount` is the
 * team member count minus everyone who answered (§2: all team members count,
 * admins play too). Clamped at 0 in case a stale vote outlives a membership.
 */
export function buildVoteSummary(
  votes: { userId: string; choice: VoteChoice }[],
  memberCount: number,
  userId: string,
): VoteSummaryDto {
  let yesCount = 0;
  let noCount = 0;
  let myVote: VoteChoice | null = null;
  for (const vote of votes) {
    if (vote.choice === VoteChoice.YES) {
      yesCount += 1;
    } else if (vote.choice === VoteChoice.NO) {
      noCount += 1;
    }
    if (vote.userId === userId) {
      myVote = vote.choice;
    }
  }
  return {
    yesCount,
    noCount,
    notVotedCount: Math.max(0, memberCount - (yesCount + noCount)),
    myVote,
  };
}
