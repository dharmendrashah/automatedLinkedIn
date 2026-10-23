const DAY_MS = 86_400_000

const startOfDay = (at: number) => {
   const date = new Date(at)

   return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

// Calendar days apart, in the machine's own time zone (not 24 hour spans: a message at 23:59 is yesterday at 00:01).
const daysBetween = (at: number, now: number) => Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS)

export const sameDay = (a: number, b: number) => startOfDay(a) === startOfDay(b)

const clock = new Intl.DateTimeFormat('en-US', {
   hour: 'numeric',
   minute: '2-digit',
})
const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' })
const longWeekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' })
const monthDay = new Intl.DateTimeFormat('en-US', {
   month: 'short',
   day: 'numeric',
})
const monthDayYear = new Intl.DateTimeFormat('en-US', {
   month: 'short',
   day: 'numeric',
   year: 'numeric',
})
const full = new Intl.DateTimeFormat('en-US', {
   month: 'short',
   day: 'numeric',
   year: 'numeric',
   hour: 'numeric',
   minute: '2-digit',
})

const sameYear = (at: number, now: number) => new Date(at).getFullYear() === new Date(now).getFullYear()

// The time on a row of the list: the hour today, then Yesterday, the weekday within a week, the date, and the year when it is not this one.
export const formatListTime = (at: number, now: number) => {
   const days = daysBetween(at, now)

   if (days <= 0) {
      return clock.format(at)
   }

   if (days === 1) {
      return 'Yesterday'
   }

   if (days < 7) {
      return weekday.format(at)
   }

   return sameYear(at, now) ? monthDay.format(at) : monthDayYear.format(at)
}

export const formatFull = (at: number) => full.format(at).replace(' at ', ', ')

// The heading of a day in a conversation.
export const dayLabel = (at: number, now: number) => {
   const days = daysBetween(at, now)

   if (days <= 0) {
      return 'Today'
   }

   if (days === 1) {
      return 'Yesterday'
   }

   if (days < 7) {
      return `${longWeekday.format(at)}, ${monthDay.format(at)}`
   }

   return sameYear(at, now) ? monthDay.format(at) : monthDayYear.format(at)
}

// How long it has been, in the largest unit: "12m", "5h", "3d", "10w".
export const ageOf = (since: number, now: number) => {
   const minutes = Math.floor(Math.max(0, now - since) / 60_000)

   if (minutes < 1) {
      return 'just now'
   }

   if (minutes < 60) {
      return `${minutes}m`
   }

   if (minutes < 60 * 24) {
      return `${Math.floor(minutes / 60)}h`
   }

   const days = Math.floor(minutes / (60 * 24))

   return days < 14 ? `${days}d` : `${Math.floor(days / 7)}w`
}

// "12m ago", or "just now".
export const agoOf = (since: number, now: number) => {
   const age = ageOf(since, now)

   return age === 'just now' ? age : `${age} ago`
}

// A length of time as a clock: 72 seconds is "1:12".
export const formatClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
