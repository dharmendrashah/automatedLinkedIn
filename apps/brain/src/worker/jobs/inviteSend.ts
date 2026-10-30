import { InviteImportService, LinkedInInviteService } from 'database'

import { defineJob } from './defineJob'

// Stores what finished invite runs did, moves invites pending 3 weeks to be withdrawn, and gives each account with invites due its
// next run of up to 5 (.plan/network-invites.md). Idle passes write nothing.
export const inviteSend = defineJob({
   name: 'invite-send',
   title: 'Invite queue',
   purpose:
      'Sends the invites asked for on My network, up to 5 a run within 20 a day and 100 a week per account, withdraws the ones pending for 3 weeks, and stores what each run did.',
   everyMs: 60_000,
   startAfterMs: 40_000,
   timeoutMs: 5 * 60 * 1000,
   run: async ({ signal }) => {
      const stored = await InviteImportService.importDue(signal)
      const { asked, withdraw, stale, items } = await LinkedInInviteService.dispatchWaiting()
      const done = stored.done + stored.retried + stored.failed

      if (items.length === 0 && done + withdraw + stale === 0) {
         return undefined
      }

      const summary = `${asked} invite runs asked for, ${done} runs stored, ${withdraw} invites to withdraw, ${stale} runs ended with no answer`

      return {
         ...(asked + done + withdraw + stale > 0 && { summary }),
         counts: {
            asked,
            stored: stored.done,
            retried: stored.retried,
            failed: stored.failed,
            withdraw,
            stale,
         },
         items,
      }
   },
})
