import { type UniboxConversation } from './types'

import { agoOf } from './time'

type Sending = NonNullable<UniboxConversation['sending']>

// What the bubble of a reply being sent says, and its bar: `percent` is a bar that fills, an empty `bar` one that only moves (there is no
// real percent while LinkedIn works, only the wait). Nothing is said before there is something to say.
export const sendingStatus = (sending: Sending, now: number): { line?: string; bar?: { percent?: number } } => {
   if (sending.done) {
      return {
         line: 'Sent. Showing the message...',
         bar: {},
      }
   }

   if (sending.replyId) {
      return {
         line: `Waiting for LinkedIn. Started ${agoOf(sending.since ?? sending.at, now)}.`,
         bar: {},
      }
   }

   if (sending.progress !== undefined) {
      return {
         line: `Uploading files ${sending.progress}%`,
         bar: { percent: sending.progress },
      }
   }

   return {}
}
