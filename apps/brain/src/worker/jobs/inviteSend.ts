import { InviteImportService, LinkedInInviteService } from 'database'

import { defineJob } from './defineJob'

// Stores what finished invite runs did and gives each account with invites due its next run of up to 5
// (.plan/network-invites.md). Pending invites are never withdrawn by this job. Idle passes write nothing.
export const inviteSend = defineJob({
   name: 'invite-send',
   title: 'Invite queue',
   purpose:
      'Sends the invites asked for on My network, up to 5 a run within each account\u2019s own daily and weekly limit, and stores what each run did. It never withdraws pending invites.',
   everyMs: 60_000,
   startAfterMs: 40_000,
   timeoutMs: 5 * 60 * 1000,
   run: async ({ signal }) => {
      const stored = await InviteImportService.importDue(signal)
      const { asked, stale, items } = await LinkedInInviteService.dispatchWaiting()
      const done = stored.done + stored.retried + stored.failed

      if (items.length === 0 && done + stale === 0) {
         return undefined
      }

      const summary = `${asked} invite runs asked for, ${done} runs stored, ${stale} runs ended with no answer`

      return {
         ...(asked + done + stale > 0 && { summary }),
         counts: {
            asked,
            stored: stored.done,
            retried: stored.retried,
            failed: stored.failed,
            stale,
         },
         items,
      }
   },
})
