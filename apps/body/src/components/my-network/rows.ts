// The pure rules of the people table: counts, the next step of a row, and which row is selected after a move or an action.

type Link = { kind: string; accountId: string | null; sourceId: string }

export type NextStep =
   { kind: 'REPLY' } | { kind: 'ACCEPT'; accountId: string; requestId: string } | { kind: 'INVITE' } | null

// What brain's Needs me puts first (`PRIORITY` in brain's peopleIndex.ts): a reply, a request, someone ready to invite.
export const PRIORITY = {
   REPLY: 3,
   REQUEST: 2,
   INVITE: 1,
} as const

export const SELECT_MAX = 100

// The periods the results line can cover.
export const RESULT_DAYS = [7, 30, 90] as const

export type ResultDays = (typeof RESULT_DAYS)[number]

export const resultDays = (value: string): ResultDays => RESULT_DAYS.find(days => String(days) === value) ?? 7

// Brain stops counting here; the Today line has no cap of its own.
export const COUNT_CAP = 10_000

// "10k+" above the cap the server counts to.
export const countText = (value: number, cap: number) => (value > cap ? `${cap / 1000}k+` : value.toLocaleString('en'))

// A reply waits: Reply. A request waits: Accept it on the account that got it. Ready to invite (once invites are live): Invite.
export const nextStepOf = ({
   priority,
   links,
   invitesLive,
}: {
   priority: number
   links: Link[]
   invitesLive: boolean
}): NextStep => {
   if (priority === PRIORITY.REPLY) {
      return { kind: 'REPLY' }
   }

   if (priority === PRIORITY.INVITE) {
      return invitesLive ? { kind: 'INVITE' } : null
   }

   const request = priority === PRIORITY.REQUEST ? links.find(({ kind }) => kind === 'REQUEST') : undefined

   return request?.accountId
      ? {
           kind: 'ACCEPT',
           accountId: request.accountId,
           requestId: request.sourceId,
        }
      : null
}

// j and k move one row, staying at the ends; from nothing they start at the top.
export const stepFrom = (ids: string[], current: string | null, delta: 1 | -1) => {
   const at = current ? ids.indexOf(current) : -1

   if (at < 0) {
      return ids[0] ?? null
   }

   return ids[Math.min(Math.max(at + delta, 0), ids.length - 1)] ?? null
}

// After an action on a row the row below it is selected, or the one above when it was the last.
export const nextAfter = (ids: string[], id: string) => {
   const at = ids.indexOf(id)

   if (at < 0) {
      return null
   }

   return ids[at + 1] ?? ids[at - 1] ?? null
}

export const toggleChosen = (chosen: string[], id: string) =>
   chosen.includes(id) ? chosen.filter(other => other !== id) : chosen.length < SELECT_MAX ? [...chosen, id] : chosen

export type KeyAction = 'next' | 'previous' | 'open' | null

// The table's keys, never while typing or with a modifier held.
export const keyAction = ({
   key,
   typing,
   modified,
}: {
   key: string
   typing: boolean
   modified: boolean
}): KeyAction => {
   if (typing || modified) {
      return null
   }

   return key === 'j' ? 'next' : key === 'k' ? 'previous' : key === 'Enter' ? 'open' : null
}
