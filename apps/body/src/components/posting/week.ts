import type { PublicationState } from './publication'

// The week view of the Write a post page: what is planned, posted or drafted for each account, by day. Days are the viewer's own
// (Monday first); the times are shown in the viewer's zone too.

export type Entry = {
   id: string
   accountId: string
   at: Date
   kind: 'planned' | 'posted' | 'failed' | 'draft'
   text: string
}

type PostLike = {
   id: string
   accountId: string
   state: PublicationState
   words: string
   scheduledAt: string | null
   postedAt: string | null
   createdAt: string
}

type DraftLike = {
   id: string
   accountId: string
   plannedAt: string | null
   words: string
}

export const startOfWeek = (now: Date, offset = 0) => {
   const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
   const sinceMonday = (start.getDay() + 6) % 7

   start.setDate(start.getDate() - sinceMonday + offset * 7)

   return start
}

export const weekDays = (start: Date) =>
   Array.from({ length: 7 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index))

const kindOf = (state: PublicationState): Entry['kind'] =>
   state === 'POSTED' ? 'posted' : state === 'FAILED' || state === 'UNKNOWN' ? 'failed' : 'planned'

// The day a post belongs to: when it went, else when it was to start, else when it was sent for posting.
const postTime = (post: PostLike) =>
   new Date(post.state === 'POSTED' ? (post.postedAt ?? post.createdAt) : (post.scheduledAt ?? post.createdAt))

export const entriesOf = (posts: PostLike[], drafts: DraftLike[]): Entry[] => [
   ...posts.map(post => ({
      id: post.id,
      accountId: post.accountId,
      at: postTime(post),
      kind: kindOf(post.state),
      text: post.words,
   })),
   ...drafts.flatMap(draft =>
      draft.plannedAt
         ? [
              {
                 id: draft.id,
                 accountId: draft.accountId,
                 at: new Date(draft.plannedAt),
                 kind: 'draft' as const,
                 text: draft.words,
              },
           ]
         : []
   ),
]

// The entries of one week, by account and day index (0 is Monday), each day in time order.
export const byCell = (entries: Entry[], start: Date) => {
   // Day starts by the calendar, so a week with a clock change still has seven days.
   const starts = [...weekDays(start), new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)].map(day =>
      day.getTime()
   )
   const cells = new Map<string, Entry[]>()

   for (const entry of entries) {
      const time = entry.at.getTime()
      const day = starts.findIndex((from, index) => index < 7 && time >= from && time < (starts[index + 1] ?? from))

      if (day >= 0) {
         const key = `${entry.accountId}|${day}`

         cells.set(key, [...(cells.get(key) ?? []), entry])
      }
   }

   for (const list of cells.values()) {
      list.sort((a, b) => a.at.getTime() - b.at.getTime())
   }

   return cells
}
