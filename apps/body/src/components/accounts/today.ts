import { type AccountStatus } from './types'

import { formatMinutes } from '../browsing/format'
import { dayInZone } from '../browsing/heatmap-grid'

export type ItemName = 'login' | 'visit' | 'messages' | 'network'

export const ITEMS: { item: ItemName; title: string; short: string; helper: string }[] = [
   {
      item: 'login',
      title: 'Check login',
      short: 'Login',
      helper: 'Signs in once to check the saved login works. Posts and messages nothing.',
   },
   {
      item: 'visit',
      title: 'Daily visit',
      short: 'Visit',
      helper: 'Opens LinkedIn once, like the daily check-in.',
   },
   {
      item: 'messages',
      title: 'Check messages',
      short: 'Messages',
      helper: 'Reads new conversations every 30 minutes, every 2 hours at night. Nothing is sent or accepted.',
   },
   {
      item: 'network',
      title: 'Check my network',
      short: 'Network',
      helper: 'Reads the connection requests you received. Accepts or ignores nothing.',
   },
]

const NO_ANSWER_MS = 30 * 60 * 1000
// Two night gaps (reads are 2 hours apart at night), so a read is never called late overnight.
const MESSAGES_LATE_AFTER_MS = 4 * 60 * 60 * 1000
const SIGNED_IN_DAY_MS = 24 * 60 * 60 * 1000
const SIGNED_IN_COUNTS_MS = 12 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

type Time = string | Date

export type RunLike = {
   id: string
   status: 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED'
   verdict: string | null
   trigger: string | null
   startedAt: Time
   finishedAt: Time | null
}

export type ItemFacts = {
   item: ItemName
   next: Time | null
   last: (RunLike & { queued: boolean }) | null
   lastOk: RunLike | null
}

export type Tone = 'success' | 'failure' | 'running' | 'unknown' | 'neutral'

export type Context = {
   now: Date
   // The account's own day.
   zone: string
   status: AccountStatus
   lastVerifiedAt: Time | null
   // The first read of the messages still goes in batches.
   firstRead: boolean
   // How a finished run is called and judged: the worker's own labels.
   resultOf: (run: RunLike) => { label: string; tone: Tone }
}

export type StateKind =
   | 'DONE'
   | 'RUNNING'
   | 'WAITING'
   | 'FAILED'
   | 'UNSURE'
   | 'PENDING'
   | 'LATER'
   | 'ON_SCHEDULE'
   | 'LATE'
   | 'COUNTED'
   | 'PAUSED'
   | 'SIGN_IN'
   | 'NO_ANSWER'

export type StateTone = 'ok' | 'bad' | 'warn' | 'muted' | 'busy'

export type ItemState = {
   item: ItemName
   kind: StateKind
   tone: StateTone
   // The chip: "Login 09:12", "Visit in process".
   text: string
   // One sentence for the tooltip.
   detail: string
   // The newest run: when ("09:12" or "26/10 09:12"), how it ended, and which session.
   last: string | null
   result: string | null
   resultTone: Tone | null
   runId: string | null
   // The newest run that worked, for a failed item.
   lastOkText: string | null
   lastOkId: string | null
   // When it comes next ("today 14:00", "tomorrow 09:05", or why not), and the time itself while one is planned.
   next: string
   at: Date | null
}

export const KIND_LABEL: Record<StateKind, string> = {
   DONE: 'Done',
   RUNNING: 'In process',
   WAITING: 'Waiting to start',
   FAILED: 'Failed',
   UNSURE: 'Unsure',
   PENDING: 'Pending today',
   LATER: 'Later',
   ON_SCHEDULE: 'On schedule',
   LATE: 'Late',
   COUNTED: 'Counted',
   PAUSED: 'Paused',
   SIGN_IN: 'Waiting for sign-in',
   NO_ANSWER: 'No answer',
}

const TONE: Record<StateKind, StateTone> = {
   DONE: 'ok',
   RUNNING: 'busy',
   WAITING: 'warn',
   FAILED: 'bad',
   UNSURE: 'warn',
   PENDING: 'muted',
   LATER: 'muted',
   ON_SCHEDULE: 'ok',
   LATE: 'warn',
   COUNTED: 'ok',
   PAUSED: 'muted',
   SIGN_IN: 'muted',
   NO_ANSWER: 'warn',
}

const metaOf = (item: ItemName) =>
   ITEMS.find(entry => entry.item === item) ?? {
      item,
      title: item,
      short: item,
      helper: '',
   }

export const clock = (moment: Date, zone: string) => {
   const options = { hour: '2-digit', minute: '2-digit', hour12: false } as const

   try {
      return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: zone }).format(moment)
   } catch {
      return new Intl.DateTimeFormat('en-GB', options).format(moment)
   }
}

const dateText = (moment: Date, zone: string) => {
   const options = { day: '2-digit', month: '2-digit' } as const

   try {
      return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: zone }).format(moment)
   } catch {
      return new Intl.DateTimeFormat('en-GB', options).format(moment)
   }
}

// "09:12" for today, "26/10 09:12" for another day.
const whenText = (moment: Date, now: Date, zone: string) =>
   dayInZone(moment, zone) === dayInZone(now, zone)
      ? clock(moment, zone)
      : `${dateText(moment, zone)} ${clock(moment, zone)}`

// "20 min ago", "1 h 50 min ago", "3 days ago".
export const agoText = (from: Date, now: Date) => {
   const ms = now.getTime() - from.getTime()

   if (ms < 60_000) {
      return 'just now'
   }

   if (ms < DAY_MS) {
      return `${formatMinutes(ms / 1000)} ago`
   }

   const days = Math.floor(ms / DAY_MS)

   return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

// "today 14:00", "tomorrow 09:05" or "28/10 02:55".
const nextText = (next: Date, now: Date, zone: string) => {
   const day = dayInZone(next, zone)

   if (day === dayInZone(now, zone)) {
      return `today ${clock(next, zone)}`
   }

   return day === dayInZone(new Date(now.getTime() + DAY_MS), zone)
      ? `tomorrow ${clock(next, zone)}`
      : `${dateText(next, zone)} ${clock(next, zone)}`
}

// What one item of one account is in right now, from the newest run and the schedule. Pure: the facts and the clock come in.
export const itemState = (facts: ItemFacts, ctx: Context): ItemState => {
   const { item, last, lastOk } = facts
   const { now, zone, status } = ctx
   const { title, short } = metaOf(item)
   const lastAt = last ? new Date(last.startedAt) : null
   const next = facts.next ? new Date(facts.next) : null
   const signedInAt = ctx.lastVerifiedAt ? new Date(ctx.lastVerifiedAt) : null
   const signedInWithin = (ms: number) => signedInAt !== null && now.getTime() - signedInAt.getTime() <= ms
   const judged = last && last.status !== 'IN_PROGRESS' ? ctx.resultOf(last) : null
   const lastToday = lastAt !== null && dayInZone(lastAt, zone) === dayInZone(now, zone)
   const nextWords = next ? nextText(next, now, zone) : 'planned soon'
   const okAt = lastOk ? new Date(lastOk.startedAt) : null
   // What the run's chip says: the worker's own label for a finished run; for one that has not finished, where it stands.
   const shown: { label: string; tone: Tone } | null =
      judged ??
      (last && lastAt
         ? now.getTime() - lastAt.getTime() > NO_ANSWER_MS
            ? { label: 'No answer', tone: 'unknown' }
            : { label: last.queued ? 'Queued' : 'In process', tone: 'running' }
         : null)

   const make = (kind: StateKind, text: string, detail: string, nextIs = nextWords, planned = false): ItemState => ({
      item,
      kind,
      tone: TONE[kind],
      text,
      detail,
      last: lastAt ? whenText(lastAt, now, zone) : null,
      result: shown?.label ?? null,
      resultTone: shown?.tone ?? null,
      runId: last?.id ?? null,
      lastOkText: okAt ? whenText(okAt, now, zone) : null,
      lastOkId: lastOk?.id ?? null,
      next: nextIs,
      at: planned ? next : null,
   })

   if (last && lastAt && last.status === 'IN_PROGRESS') {
      if (now.getTime() - lastAt.getTime() > NO_ANSWER_MS) {
         return make(
            'NO_ANSWER',
            `${short} no answer`,
            `${title} started ${whenText(lastAt, now, zone)} and gave no answer in 30 minutes.`
         )
      }

      return last.queued
         ? make('WAITING', `${short} queued`, `${title} is queued and starts when its turn comes.`)
         : make('RUNNING', `${short} in process`, `${title} is running now.`)
   }

   if (last && lastAt && judged) {
      const when = lastToday ? clock(lastAt, zone) : agoText(lastAt, now)

      if (judged.tone === 'failure') {
         const good = okAt ? ` Last good run: ${whenText(okAt, now, zone)}.` : ''

         return make(
            'FAILED',
            `${short} failed ${when}`,
            `${title} failed ${whenText(lastAt, now, zone)}: ${judged.label}.${good}`
         )
      }

      if (judged.tone === 'neutral' || judged.tone === 'unknown') {
         return make(
            'UNSURE',
            `${short} unsure ${when}`,
            `${title} ran ${whenText(lastAt, now, zone)} but could not decide: ${judged.label}.`
         )
      }

      if (item !== 'messages' && lastToday) {
         return make(
            'DONE',
            `${short} ${clock(lastAt, zone)}`,
            `${title} was done at ${clock(lastAt, zone)}: ${judged.label}.`
         )
      }
   }

   if (status === 'DISABLED') {
      return make('PAUSED', `${short} paused`, 'Paused by you. Nothing runs until you resume the account.', 'paused')
   }

   const active = status === 'ACTIVE'
   const eligible = item === 'login' ? active || status === 'ERROR' : active && signedInWithin(SIGNED_IN_DAY_MS)

   if (!eligible) {
      const why =
         item === 'login'
            ? status === 'PENDING'
               ? 'Press Test login first. Nothing is scheduled until the account signs in.'
               : status === 'BLOCKED'
                 ? 'LinkedIn restricted this account.'
                 : 'LinkedIn asks to sign in again. Nothing is scheduled until it does.'
            : 'Waits for the sign-in check to pass. It runs by itself.'

      return make('SIGN_IN', `${short} waiting for sign-in`, why, 'after the sign-in')
   }

   if (item === 'login' && signedInAt && signedInWithin(SIGNED_IN_COUNTS_MS)) {
      return make(
         'COUNTED',
         `${short} counted ${clock(signedInAt, zone)}`,
         `Signed in at ${clock(signedInAt, zone)}, within the last 12 hours, which counts as the check.`
      )
   }

   if (item === 'messages' && last && lastAt && judged) {
      const ago = agoText(lastAt, now)
      const first = ctx.firstRead ? ' The first read of the messages still goes on, in batches.' : ''

      return now.getTime() - lastAt.getTime() > MESSAGES_LATE_AFTER_MS
         ? make(
              'LATE',
              `Messages late: read ${ago}`,
              `The messages are read every 30 minutes, every 2 hours at night; the last read was ${ago}.${first}`,
              nextWords,
              true
           )
         : make(
              'ON_SCHEDULE',
              `Messages read ${ago}`,
              `The messages are read every 30 minutes, every 2 hours at night; the last read was ${ago}.${first}`,
              nextWords,
              true
           )
   }

   if (!next) {
      return make('LATER', `${short} planned soon`, `${title} has no time yet; it gets one soon.`)
   }

   if (next.getTime() <= now.getTime()) {
      return make(
         'WAITING',
         `${short} waiting to start`,
         `${title} is due and starts at the next pass.`,
         'waiting to start'
      )
   }

   return dayInZone(next, zone) === dayInZone(now, zone)
      ? make('PENDING', `${short} ${clock(next, zone)}`, `${title} is planned for ${nextWords}.`, nextWords, true)
      : make(
           'LATER',
           `${short} ${nextWords.replace(/ \d\d:\d\d$/, '')}`,
           `${title} is planned for ${nextWords}.`,
           nextWords,
           true
        )
}

// How many of the four checks are done: a good run today, a sign-in in the last 12 hours for the login, and messages read on schedule
// (they run every 30 minutes, so they are never "done today", only on schedule or late).
export const checksDone = (states: ItemState[]) =>
   states.filter(({ kind }) => kind === 'DONE' || kind === 'COUNTED' || kind === 'ON_SCHEDULE').length

// One tone for the whole day of an account: red when a check failed, amber when one needs a look, green when all four are done.
export const overallTone = (states: ItemState[]): StateTone =>
   states.some(({ tone }) => tone === 'bad')
      ? 'bad'
      : states.some(({ tone }) => tone === 'warn')
        ? 'warn'
        : checksDone(states) === ITEMS.length
          ? 'ok'
          : 'muted'

export const progressText = (states: ItemState[]) => `${checksDone(states)} of ${ITEMS.length} checks done`

// One line for the list: the first failure with its time, else the count of checks done.
export const briefText = (states: ItemState[]) =>
   states.find(({ kind }) => kind === 'FAILED')?.text ?? progressText(states)

export type DayProgress = {
   done: number
   total: number
   // The next planned item of any account.
   next: { item: ItemName; at: Date } | null
}

// The checks of the accounts that are signed in, and what comes next across them.
export const dayProgress = (accounts: { status: AccountStatus; states: ItemState[] }[], now: Date): DayProgress => {
   const active = accounts.filter(({ status }) => status === 'ACTIVE')
   const planned = active
      .flatMap(({ states }) => states)
      .flatMap(({ item, at }) => (at && at.getTime() > now.getTime() ? [{ item, at }] : []))
      .sort((a, b) => a.at.getTime() - b.at.getTime())

   return {
      done: active.reduce((sum, { states }) => sum + checksDone(states), 0),
      total: active.length * ITEMS.length,
      next: planned[0] ?? null,
   }
}

// "7 of 12 checks done today. Next: messages 14:00."
export const progressSentence = ({ done, total, next }: DayProgress, zone: string) =>
   total === 0
      ? null
      : `${done} of ${total} checks done today.${next ? ` Next: ${metaOf(next.item).short.toLowerCase()} ${clock(next.at, zone)}.` : ''}`
