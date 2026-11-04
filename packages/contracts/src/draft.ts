import { z } from 'zod'

// Words and approval (.plan/lead-pipeline-p4-ai-drafts.md): the limits, the fixed sentences, the saved writing voice and the checks every
// piece of words passes, after the model wrote it and after the owner edited it. Pure, so brain and the inbox use the same ones.

export const DRAFT_KINDS = ['COMMENT', 'MESSAGE', 'REPLY'] as const

export type DraftKind = (typeof DRAFT_KINDS)[number]

export const DRAFT_STATES = ['DRAFTED', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'] as const

export type DraftState = (typeof DRAFT_STATES)[number]

export const DRAFT_MODES = ['TEXTS', 'AI'] as const

export const REJECT_REASONS = {
   OFF_TOPIC: 'Off topic',
   TOO_GENERIC: 'Too generic',
   WRONG_TONE: 'Wrong tone',
   SENSITIVE: 'Sensitive post',
   OTHER: 'Other',
} as const

export type RejectReason = keyof typeof REJECT_REASONS

export const DRAFT_LIMITS = {
   // Drafts one "Ask me first" block puts in the inbox a day, how long one waits, and how many may wait at once.
   perDay: {
      min: 1,
      max: 100,
      default: 10,
   },
   expireHours: [6, 12, 24, 48, 72, 168],
   expireDefault: 48,
   keepWaiting: {
      min: 1,
      max: 100,
      default: 20,
   },
   // After approval the act has this long to go, so a draft approved late is still acted on.
   actHours: 24,
   // Approvals close together start one run.
   groupMinutes: {
      min: 0,
      max: 60,
      default: 5,
   },
   runsPerHour: {
      min: 1,
      max: 200,
      default: 30,
   },
   // How many runs may wait behind a live run of the workflow before an approval is held for its turn.
   queuedRuns: 3,
   // A held approval is dropped after this long.
   heldHours: 6,
   // The text of a draft, its item and its card are cleared after this many days; the row, counts and cost stay.
   retentionDays: 30,
   // The most characters of a comment LinkedIn takes.
   commentChars: 1_250,
} as const

export const WRITE_LIMITS = {
   // Texts of "From my texts", each with spintax and variables.
   texts: 20,
   textChars: 1_250,
   goalChars: 200,
   extraChars: 500,
   minPostChars: {
      min: 0,
      max: 2_000,
      default: 80,
   },
   perRun: {
      min: 1,
      max: 200,
      default: 30,
   },
   // Previews an owner may ask for a day.
   previewsPerDay: 10,
} as const

export const WRITE_LENGTHS = ['short', 'medium', 'long'] as const

export type WriteLength = (typeof WRITE_LENGTHS)[number]

// About how long the words are by kind and length; the limits of LinkedIn always win.
export const WRITE_CHARS: Record<DraftKind, Record<WriteLength, number>> = {
   COMMENT: {
      short: 120,
      medium: 260,
      long: 600,
   },
   MESSAGE: {
      short: 200,
      medium: 500,
      long: 1_000,
   },
   REPLY: {
      short: 200,
      medium: 500,
      long: 1_000,
   },
}

// One sentence for each way a block leaves an item without words, so the Else tells why.
export const WRITE_REASONS = {
   TOO_SHORT: 'Too short to answer.',
   SENSITIVE: 'Sensitive, so skipped.',
   UNSURE: 'Not sure what to say.',
   ORDERS: 'The text tried to give orders.',
   UNSUITABLE: 'Not suitable.',
   ALIKE: 'Too like an earlier text.',
   NOT_SET_UP: 'AI is not set up.',
   LIMIT: 'AI limit reached.',
   NO_ANSWER: 'AI did not answer.',
   PAUSED: 'Paused by the admin.',
   DO_NOT_CONTACT: 'On Do not contact.',
   NO_TEXT: 'No text fits.',
   EMPTY: 'Words are empty.',
   NO_ITEM_KIND: 'Only posts get words so far.',
} as const

export type WriteReason = keyof typeof WRITE_REASONS

// What "Ask me first" says about an item it did not put in the inbox.
export const APPROVE_REASONS = {
   NO_WORDS: 'No words to approve.',
   OVER_DAY: "Over today's limit.",
   TOO_MANY: 'Too many waiting.',
   WAITING: 'Already waiting.',
   DO_NOT_CONTACT: 'On Do not contact.',
} as const

export const VOICE_TONES = ['friendly', 'professional', 'direct', 'playful'] as const

export const voiceSchema = z.object({
   name: z.string().trim().min(1).max(60),
   about: z.string().trim().max(600).default(''),
   tone: z.enum(VOICE_TONES).default('friendly'),
   language: z.string().trim().max(40).default(''),
   avoid: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).default([]),
   rules: z.string().trim().max(500).default(''),
})

export type VoiceInput = z.input<typeof voiceSchema>

export type Check = {
   key: 'length' | 'link' | 'mention' | 'contact' | 'hashtag' | 'emoji' | 'avoid' | 'alike'
   label: string
   ok: boolean
}

const URL_LIKE = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|io|net|org|co|ai|app|dev|me)\b/i
const MENTION = /(?:^|\s)@\w/
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/
const PHONE = /(?:\+?\d[\s().-]?){8,}/
const HASHTAG = /(?:^|\s)#\w/
const EMOJI = /\p{Extended_Pictographic}/gu

// Three word runs, so two texts that share a phrase are close even when a word changes.
const shingles = (text: string) => {
   const words = text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []
   const size = words.length >= 3 ? 3 : 1

   return new Set(
      Array.from({ length: Math.max(words.length - size + 1, 0) }, (_unused, at) =>
         words.slice(at, at + size).join(' ')
      )
   )
}

// How much of the shorter text the other one repeats, from 0 to 1.
export const overlapOf = (a: string, b: string) => {
   const [left, right] = [shingles(a), shingles(b)]
   const smaller = Math.min(left.size, right.size)

   return smaller === 0 ? 0 : [...left].filter(each => right.has(each)).length / smaller
}

export const ALIKE_AT = 0.6

type Words = {
   text: string
   maxChars: number
   // The voice's words to avoid.
   avoid?: string[]
   // The account's last pieces of the same kind and the other words of this run: close to one of them fails.
   recent?: string[]
}

// Every check on a piece of words, each with the sentence the inbox shows. `ok` on all of them is what lets words through.
export const checkWords = ({ text, maxChars, avoid = [], recent }: Words): Check[] => {
   const trimmed = text.trim()
   const lower = trimmed.toLowerCase()

   return [
      {
         key: 'length',
         label: `Between 1 and ${maxChars} characters`,
         ok: trimmed.length > 0 && trimmed.length <= maxChars,
      },
      {
         key: 'link',
         label: 'No link',
         ok: !URL_LIKE.test(trimmed),
      },
      {
         key: 'mention',
         label: 'No mention',
         ok: !MENTION.test(trimmed),
      },
      {
         key: 'contact',
         label: 'No email or phone',
         ok: !EMAIL.test(trimmed) && !PHONE.test(trimmed),
      },
      {
         key: 'hashtag',
         label: 'No hashtag',
         ok: !HASHTAG.test(trimmed),
      },
      {
         key: 'emoji',
         label: 'At most one emoji',
         ok: (trimmed.match(EMOJI) ?? []).length <= 1,
      },
      ...(avoid.length > 0
         ? [
              {
                 key: 'avoid' as const,
                 label: 'None of the words you avoid',
                 ok: !avoid.some(word =>
                    new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped(word)}(?:$|[^\\p{L}\\p{N}])`, 'u').test(lower)
                 ),
              },
           ]
         : []),
      ...(recent
         ? [
              {
                 key: 'alike' as const,
                 label: 'Not like your last 20',
                 ok: !recent.some(other => overlapOf(trimmed, other) >= ALIKE_AT),
              },
           ]
         : []),
   ]
}

function escaped(word: string) {
   return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// The reason an item is left out when a check fails: a word that is too like an earlier one says so, anything else is not suitable.
export const failedReason = (checks: Check[]): WriteReason | null => {
   const failed = checks.find(({ ok }) => !ok)

   if (!failed) {
      return null
   }

   return failed.key === 'alike' ? 'ALIKE' : 'UNSUITABLE'
}
