import { z } from 'zod'

import { moodOf } from './mood'

// The revenue pipeline of a campaign (.plan/campaign-revenue-pipeline.md): the positive replies it brought times what one is worth a month
// times 12. The AI is only asked about a reply when the word rules are not sure.

// The most one positive reply may be worth, in whole USD a month. Keeps replies x worth x 12 far below the largest safe integer.
export const REPLY_VALUE_MAX_USD = 1_000_000

// The AI must be at least this sure (out of 100) before a reply counts.
export const MIN_AI_CONFIDENCE = 70

// One press of "count positive replies from my existing messages" asks the AI at most this many times; the rest wait for the next press.
export const BACKFILL_AI_CALLS = 200

// A check that could not be answered (the model unreachable, the budget spent) is tried again this many times, then given up.
export const MAX_CHECK_ATTEMPTS = 3

// A check waiting longer than this is given up: the owner can still mark the reply by hand.
export const CHECK_MAX_AGE_DAYS = 14

export const replyValueSchema = z.number().int().min(1).max(REPLY_VALUE_MAX_USD)

export const replyValueInputSchema = z.object({
   id: z.string().min(1).max(100),
   // Null clears it: the pipeline then shows no USD figure.
   valueUsd: replyValueSchema.nullable(),
})

// Positive replies x (monthly worth x 12). Null when the owner has not said what a reply is worth: never a 0 that looks like a result.
export const pipelineOf = (replies: number, monthlyUsd: number | null) =>
   monthlyUsd === null ? null : replies * (monthlyUsd * 12)

export const POSITIVE_REPLY_SOURCES = ['RULES', 'AI', 'MARKED'] as const

export type PositiveReplySource = (typeof POSITIVE_REPLY_SOURCES)[number]

export const SOURCE_LABELS: Record<PositiveReplySource, string> = {
   RULES: 'Detected by rules',
   AI: 'Detected by AI',
   MARKED: 'Marked by you',
}

// What the word rules say about one reply: a sure yes (a strong phrase of interest), a sure no (a no, an away reply, a request to stop,
// nothing written), or not sure. Only "not sure" is ever sent to the AI.
export type ReplyLean = 'yes' | 'no' | 'unsure'

const STRONG_INTEREST =
   /\b(interested|sounds (good|great|interesting)|let'?s (talk|chat|connect|do it)|love to|happy to|would like to|send (me )?(more|details|info)|tell me more|book a|schedule a|set up a (call|meeting)|great idea)\b/

// A hedge or a negation anywhere in the reply, so "I'm not sure I'm interested" is never a sure yes.
const HEDGE = /\b(not|never|no longer|but|maybe|perhaps|if|unless|however|although)\b|n'?t\b/

export const replyLeanOf = (text: string): ReplyLean => {
   const words = text.toLowerCase().replace(/[’‘]/g, "'").trim()

   if (words === '') {
      return 'no'
   }

   const { mood } = moodOf(words)

   if (mood === 'negative' || mood === 'unsubscribe' || mood === 'out_of_office') {
      return 'no'
   }

   return STRONG_INTEREST.test(words) && !HEDGE.test(words) ? 'yes' : 'unsure'
}
