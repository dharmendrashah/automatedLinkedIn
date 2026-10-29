// The line that says when an automatic read happens next, for My network (the connection requests are read once a day) and for the Unibox
// (the messages are read every 30 minutes, every 2 hours at night). Each account has its own time, so the line gives the earliest one of the accounts shown.
// Pure: the time zone is the browser's unless one is given.

export type Rhythm = 'DAILY' | 'MESSAGES'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

const parts = (date: Date, timeZone: string | undefined, options: Intl.DateTimeFormatOptions) =>
   Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', { timeZone, ...options })
         .formatToParts(date)
         .map(({ type, value }) => [type, value])
   )

// "2026-10-28": the day of a date in the zone, to tell today from tomorrow.
const dayOf = (date: Date, timeZone: string | undefined) => {
   const { year, month, day } = parts(date, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' })

   return `${year}-${month}-${day}`
}

const clockOf = (date: Date, timeZone: string | undefined) => {
   const { hour, minute } = parts(date, timeZone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

   return `${hour}:${minute}`
}

// "today", "tomorrow", or "Fri 31 Oct".
const dayText = (at: Date, now: Date, timeZone: string | undefined) => {
   const day = dayOf(at, timeZone)

   if (day === dayOf(now, timeZone)) {
      return 'today'
   }

   if (day === dayOf(new Date(now.getTime() + 24 * HOUR_MS), timeZone)) {
      return 'tomorrow'
   }

   const { weekday, day: number, month } = parts(at, timeZone, { weekday: 'short', day: 'numeric', month: 'short' })

   return `${weekday} ${number} ${month}`
}

// "today at 14:35", "tomorrow at 08:42", or "Fri 31 Oct at 08:42".
const whenText = (at: Date, now: Date, timeZone: string | undefined) =>
   `${dayText(at, now, timeZone)} at ${clockOf(at, timeZone)}`

// "tomorrow between 06:30 and 17:40" when both are on one day, else "today at 14:35 and Fri 31 Oct at 08:42".
const rangeText = (first: Date, last: Date, now: Date, timeZone: string | undefined) =>
   dayText(first, now, timeZone) === dayText(last, now, timeZone)
      ? `${dayText(first, now, timeZone)} between ${clockOf(first, timeZone)} and ${clockOf(last, timeZone)}`
      : `${whenText(first, now, timeZone)} and ${whenText(last, now, timeZone)}`

// "in about 1 hour 20 minutes", "in about 35 minutes", "in less than a minute".
const inText = (ms: number) => {
   const minutes = Math.max(1, Math.round(ms / MINUTE_MS))

   if (ms < MINUTE_MS) {
      return 'in less than a minute'
   }

   if (minutes < 60) {
      return `in about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
   }

   const hours = Math.floor(minutes / 60)
   const rest = minutes % 60

   return `in about ${hours} ${hours === 1 ? 'hour' : 'hours'}${rest > 0 ? ` ${rest} ${rest === 1 ? 'minute' : 'minutes'}` : ''}`
}

// The sentence for the accounts shown: how often they are read, and when the next read is. `times` has one entry for each account
// shown that is signed in (null when its time is not drawn yet). Once a day each account has its own time, so for several accounts the
// line gives the earliest and the latest; for the messages it gives the earliest.
export const nextCheckText = (
   times: Array<string | null | undefined>,
   now: Date,
   rhythm: Rhythm,
   timeZone?: string
) => {
   const intro =
      rhythm === 'DAILY'
         ? 'Read automatically once a day.'
         : 'Messages are read automatically every 30 minutes, every 2 hours at night.'
   const noun = rhythm === 'DAILY' ? 'check' : 'read'
   const known = times.flatMap(time => (time ? [new Date(time)] : [])).sort((a, b) => a.getTime() - b.getTime())
   const first = known[0]
   const last = known.at(-1)

   if (times.length === 0) {
      return intro
   }

   if (!first || !last) {
      return `${intro} The first ${noun} is being scheduled.`
   }

   const left = first.getTime() - now.getTime()

   if (rhythm === 'DAILY') {
      const unscheduled = times.length - known.length
      const rest =
         unscheduled > 0
            ? ` ${unscheduled} ${unscheduled === 1 ? 'account is' : 'accounts are'} not scheduled yet.`
            : ''
      const when =
         left <= 0
            ? 'due now'
            : known.length > 1
              ? rangeText(first, last, now, timeZone)
              : whenText(first, now, timeZone)
      const own = known.length > 1 ? ', each account at its own time' : ''

      return `${intro} Next ${noun}${known.length > 1 ? 's' : ''}: ${when}${own}.${rest}`
   }

   const many = times.length > 1 ? ` It is the earliest of ${times.length} accounts.` : ''

   return `${intro} Next ${noun}: ${left <= 0 ? 'due now' : inText(left)}.${many}`
}
