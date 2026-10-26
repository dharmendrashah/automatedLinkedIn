import { type PostBlock, joinedText, mediaBlock } from '@automatedLinkedIn/contracts'

import { type BrowseBudgetError } from './taskErrors'

// The limits of posting for one account (.plan/posting-send-task.md, Q2 and Q6), kept in one place. Unverified against LinkedIn's own.
export const POST_LIMITS = {
   // Posts in any 24 hours, and the quiet time between two.
   perDay: 3,
   gapMs: 60 * 60 * 1000,
   // The same words from one account within this long are refused as a repeat.
   duplicateMs: 7 * 24 * 60 * 60 * 1000,
   // A post that is due and has not started this long after is ended as not posted: nothing was typed.
   lateMs: 60 * 60 * 1000,
   // A post still sending after this long was lost with its run; it may have gone, so it is unsure.
   staleMs: 25 * 60 * 1000,
   // A planned time must be at least this far ahead.
   aheadMs: 60 * 1000,
} as const

const DAY_MS = 24 * 60 * 60 * 1000

// Why a queued post has not started, in fixed sentences the owner reads on the Posting page.
export const WAIT = {
   SLOT: "Waiting for the account's next slot.",
   HOURS: "Waiting for the account's working hours.",
   TIME: "Waiting for the account's browsing time.",
   BUSY: 'Waiting for another task on this account to finish.',
   SENDING: "Waiting for this account's other post to finish.",
   POST_GAP: 'Waiting for the hour between two posts of this account.',
   WORKER: 'Waiting for the browser worker to be ready.',
} as const

export const budgetWait = (reason: BrowseBudgetError['reason']) =>
   reason === 'OUTSIDE_OFFICE'
      ? WAIT.HOURS
      : reason === 'DAY_FULL' || reason === 'BACKGROUND_FULL'
        ? WAIT.TIME
        : WAIT.SLOT

// Why a post at `at` would break the limits next to the times of the account's other posts (milliseconds since the epoch), or
// nothing when it does not. Scheduled posts count at their time, so a plan never lets a day carry more than it may.
export const limitProblem = (others: number[], at: number) => {
   if (others.some(time => Math.abs(time - at) < POST_LIMITS.gapMs)) {
      return 'Another post of this account is less than an hour from that time. Leave at least an hour between two posts.'
   }

   const all = [...others, at].sort((a, b) => a - b)

   for (let index = 0; index + POST_LIMITS.perDay < all.length; index += 1) {
      if ((all[index + POST_LIMITS.perDay] ?? 0) - (all[index] ?? 0) < DAY_MS) {
         return `This account would have more than ${POST_LIMITS.perDay} posts in 24 hours. Choose another time.`
      }
   }

   return undefined
}

// Why a draft cannot be posted as it is, or nothing.
export const contentProblem = (blocks: PostBlock[]) => {
   const media = mediaBlock(blocks)

   if (joinedText(blocks) === '' && !media) {
      return 'A post needs words or a file.'
   }

   const files =
      media?.type === 'PHOTOS'
         ? media.items.map(({ key }) => key)
         : media?.type === 'VIDEO' || media?.type === 'DOCUMENT'
           ? [media.file.key]
           : []

   return files.some(key => key === undefined) ? 'A file is still uploading. Wait for it to finish.' : undefined
}
