import { z } from 'zod'

import { postLinkOf } from './posting'

export const ENGAGE_CONTRACT_VERSION = 1

// Reactions and comments an account makes on other people's posts, through the task `linkedin-engage` (.plan/lead-pipeline-p3-engage.md).
// One file per run, named `engage.json`, says what became of each act. The task is not built yet: it waits for recordings of the post
// page, so brain plans, queues and stores acts but none is sent until the task is registered in the spider.
export const ENGAGE_TASK = 'linkedin-engage'

// Not LinkedIn's numbers (they are not published): the daily limits live in `limits.ts`; these are how one run and one person are paced.
export const ENGAGE_LIMITS = {
   // Acts one run is asked for, and the comments among them.
   perRun: 10,
   commentsPerRun: 3,
   // The longest comment LinkedIn takes.
   commentChars: 1_250,
   // A post older than this is left alone.
   postDays: 7,
   // The rest between two acts of a run, in seconds.
   gapSeconds: {
      min: 20,
      max: 45,
   },
   // Days between two acts on one person: the block's setting runs from 0 to 14 (the default is 1), plus a stable random extra of up to a day.
   daysApart: {
      min: 0,
      max: 14,
      default: 1,
   },
   // Acts older than this and not started expire.
   queuedDays: 7,
   // A run that never answered ends its acts as UNKNOWN after this long.
   staleMinutes: 45,
   // After LinkedIn refuses, the account's engaging stops for this long.
   refusedStopHours: 24,
} as const

// The six reactions LinkedIn offers; there is no Curious.
export const REACTIONS = ['like', 'celebrate', 'support', 'love', 'insightful', 'funny'] as const

export type Reaction = (typeof REACTIONS)[number]

export const REACTION_LABELS: Record<Reaction, string> = {
   like: 'Like',
   celebrate: 'Celebrate',
   support: 'Support',
   love: 'Love',
   insightful: 'Insightful',
   funny: 'Funny',
}

export const ENGAGE_ACTS = ['REACT', 'COMMENT'] as const

export type EngageAct = (typeof ENGAGE_ACTS)[number]

const POSTS_PATH = /^\/posts\/[^/]*-(activity|ugcPost)-(\d{10,25})-[A-Za-z0-9_]+\/?$/

// The post's own address and a key that names it, or null when the link is not one the page opens by its id. A `/posts/...-share-<id>-`
// link is left out: its number is not the post's activity id (recorded 2026-11-04). The key is the same for every link to one post.
export const engagePostOf = (value: string | undefined): { link: string; key: string } | null => {
   const direct = postLinkOf(value)

   if (direct) {
      const [, type, id] = /urn:li:(activity|share|ugcPost):(\d+)/.exec(direct) ?? []

      return type === 'share' || !type || !id
         ? null
         : {
              link: direct,
              key: `${type}:${id}`,
           }
   }

   if (!value || !URL.canParse(value)) {
      return null
   }

   const { protocol, hostname, pathname } = new URL(value)
   const [, type, id] = POSTS_PATH.exec(pathname) ?? []

   return protocol === 'https:' && hostname === 'www.linkedin.com' && type && id
      ? {
           link: `https://www.linkedin.com/feed/update/urn:li:${type}:${id}/`,
           key: `${type}:${id}`,
        }
      : null
}

export const engageActSchema = z
   .strictObject({
      // Brain's own id of the act: the task only hands it back.
      id: z.uuid(),
      kind: z.enum(['react', 'comment']),
      postUrl: z.string().max(500),
      reaction: z.enum(REACTIONS).optional(),
      // The owner's own words; never put into a result, a log or an event.
      text: z.string().trim().min(1).max(ENGAGE_LIMITS.commentChars).optional(),
      // The author's name as stored, to check it is the right post.
      authorName: z.string().trim().min(1).max(200).optional(),
   })
   .refine(act => engagePostOf(act.postUrl) !== null, 'postUrl must be a post address')
   .refine(act => act.kind === 'comment' || act.text === undefined, 'only a comment has words')
   .refine(act => act.kind !== 'comment' || act.text !== undefined, 'a comment needs words')

export const engageInputSchema = z
   .strictObject({ acts: z.array(engageActSchema).min(1).max(ENGAGE_LIMITS.perRun) })
   .refine(
      input => input.acts.filter(({ kind }) => kind === 'comment').length <= ENGAGE_LIMITS.commentsPerRun,
      `At most ${ENGAGE_LIMITS.commentsPerRun} comments in one run`
   )

// REACTED, COMMENTED: it went and the page showed it. ALREADY_REACTED: the post already showed a reaction, nothing pressed (a second press
// would take it back). POST_GONE: the address led to no post, or not the one asked for. COMMENTS_OFF: the post has no comment box.
// REFUSED: LinkedIn answered with an error or a warning, so the run stopped. UNKNOWN: the button was pressed and the page did not say.
// NOT_TRIED: the run stopped before its turn, or a step did not show, nothing pressed.
export const ENGAGE_OUTCOMES = [
   'REACTED',
   'COMMENTED',
   'ALREADY_REACTED',
   'POST_GONE',
   'COMMENTS_OFF',
   'REFUSED',
   'UNKNOWN',
   'NOT_TRIED',
] as const

export type EngageOutcome = (typeof ENGAGE_OUTCOMES)[number]

// The verdicts the task answers with (never the runner's own codes).
export const ENGAGE_VERDICTS = ['DONE', 'PARTIAL', 'SIGNED_OUT', 'LIMIT_REACHED', 'RESTRICTED', 'ERROR'] as const

export const engageFileSchema = z.strictObject({
   contract: z.literal(ENGAGE_CONTRACT_VERSION),
   captured_at: z.iso.datetime(),
   acts: z
      .array(
         z.strictObject({
            id: z.uuid(),
            outcome: z.enum(ENGAGE_OUTCOMES),
         })
      )
      .max(ENGAGE_LIMITS.perRun),
})

export type EngageActInput = z.infer<typeof engageActSchema>
export type EngageInput = z.infer<typeof engageInputSchema>
export type EngageFile = z.infer<typeof engageFileSchema>
