// How the cron monitor judges a job and a message read (.plan/cron-monitor.md). Pure, so it is tested without a database.

export type JobHealth = 'HEALTHY' | 'LATE' | 'FAILING' | 'UNKNOWN'

type NewestRun = {
   finishedAt: Date
   outcome: 'WORKED' | 'IDLE' | 'FAILED' | 'TIMED_OUT'
}

// A job that has not finished a run within two intervals and 30 seconds is late. A hung job shows here too, because the
// runner skips its ticks while one is going.
const LATE_AFTER_FACTOR = 2
const LATE_GRACE_MS = 30_000

export const jobHealth = (everyMs: number, newest: NewestRun | null, now: Date): JobHealth => {
   if (!newest) {
      return 'UNKNOWN'
   }

   if (now.getTime() - newest.finishedAt.getTime() > everyMs * LATE_AFTER_FACTOR + LATE_GRACE_MS) {
      return 'LATE'
   }

   return newest.outcome === 'FAILED' || newest.outcome === 'TIMED_OUT' ? 'FAILING' : 'HEALTHY'
}

export type MessageReadState = 'ON_TIME' | 'OVERDUE' | 'WAITING' | 'NOT_SCHEDULED'

export const OVERDUE_AFTER_MS = 30 * 60 * 1000

// Only an active account has its messages read. A time that has passed by more than the grace is overdue; no time yet means the
// first one has not been drawn.
export const messageReadState = (
   account: { status: string; nextMessagesAt: Date | null },
   now: Date
): MessageReadState => {
   if (account.status !== 'ACTIVE') {
      return 'NOT_SCHEDULED'
   }

   if (!account.nextMessagesAt) {
      return 'WAITING'
   }

   return now.getTime() - account.nextMessagesAt.getTime() > OVERDUE_AFTER_MS ? 'OVERDUE' : 'ON_TIME'
}

const UNITS = [
   {
      ms: 86_400_000,
      one: 'day',
   },
   {
      ms: 3_600_000,
      one: 'hour',
   },
   {
      ms: 60_000,
      one: 'minute',
   },
   {
      ms: 1000,
      one: 'second',
   },
] as const

// "every 10 minutes": the largest unit that divides the interval evenly.
export const everyWords = (everyMs: number) => {
   const unit = UNITS.find(({ ms }) => everyMs % ms === 0) ?? UNITS[3]
   const count = Math.round(everyMs / unit.ms)

   return count === 1 ? `every ${unit.one}` : `every ${count} ${unit.one}s`
}

const ERROR_MAX = 300

// What may be stored from an error: credentials in an address, bearer tokens and long token-like strings are masked, whitespace is
// folded and the text is cut. Never a stack.
export const cleanError = (error: unknown) => {
   const text = (error instanceof Error ? `${error.name}: ${error.message}` : String(error))
      .replace(/:\/\/[^\s/@]+@/g, '://***@')
      .replace(/Bearer\s+\S+/gi, 'Bearer ***')
      .replace(/[A-Za-z0-9_+/=-]{32,}/g, '***')
      .replace(/\s+/g, ' ')
      .trim()

   return text.length > ERROR_MAX ? `${text.slice(0, ERROR_MAX - 1)}…` : text
}
