import { waitingText } from '../posting/publication'
import { type UniboxConversation } from './types'

import { agoOf } from './time'

type Sending = NonNullable<UniboxConversation['sending']>

// What the bubble of a reply being sent says, and its bar: `percent` is a bar that fills, an empty `bar` one that only moves (there is no
// real percent while LinkedIn works, only the wait). A reply queued because the account cannot start it yet says so, and when it can: it
// starts by itself, so it is not typed again, and nothing moves. Nothing is said before there is something to say.
export const sendingStatus = (sending: Sending, now: number): { line?: string; bar?: { percent?: number } } => {
   if (sending.done) {
      return {
         line: 'Sent. Showing the message...',
         bar: {},
      }
   }

   if (sending.wait) {
      return { line: `Queued. You do not need to send it again. ${waitingText(sending.wait, { now })}` }
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
