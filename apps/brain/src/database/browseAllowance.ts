import { BROWSE_MINUTES, type BrowseClass, type BrowseMode } from '@automatedLinkedIn/contracts'

// When an account may start a browser session (.plan/account-browsing-budget.md). Pure: it reads nothing and saves nothing.

export type Office = {
   timeZone: string
   // Working days as bits, Monday is bit 0 and Sunday bit 6.
   days: number
   startMinute: number
   endMinute: number
}

export type AllowanceReason = 'OUTSIDE_OFFICE' | 'DAY_FULL' | 'BACKGROUND_FULL' | 'TOO_SOON' | 'GAP'

export type AllowanceInput = {
   now: Date
   office: Office
   capSeconds: number
   // Today's time in the account's zone: settled sessions, and the ones still running at their estimate.
   usedSeconds: number
   backgroundSeconds: number
   klass: BrowseClass
   estimateSeconds: number
   lastEndedAt: Date | null
   inFlight: boolean
   // A first-day read of a new account (.plan/first-day-reads.md): it may start outside the office; the gap and the day still hold.
   anyHour?: boolean
}

export type Allowance = { ok: true } | { ok: false; reason: AllowanceReason; until: Date }

// A click is not held for an hour: this much may be used ahead of the evenly released line.
export const BURST_SECONDS = 10 * 60
export const GAP_MS = 10 * 60 * 1000
// Messages, profile and the daily visit together may take this share of the day.
export const BACKGROUND_SHARE = 0.4

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS

type Parts = { year: number; month: number; day: number; minute: number; weekday: number }

const formatterFor = (timeZone: string) => {
   try {
      return new Intl.DateTimeFormat('en-US', {
         timeZone,
         hourCycle: 'h23',
         year: 'numeric',
         month: 'numeric',
         day: 'numeric',
         hour: 'numeric',
         minute: 'numeric',
         weekday: 'short',
      })
   } catch {
      return formatterFor('UTC')
   }
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const partsOf = (date: Date, timeZone: string): Parts => {
   const found = Object.fromEntries(
      formatterFor(timeZone)
         .formatToParts(date)
         .map(({ type, value }) => [type, value])
   )

   return {
      year: Number(found.year),
      month: Number(found.month),
      day: Number(found.day),
      minute: Number(found.hour) * 60 + Number(found.minute),
      weekday: WEEKDAYS.indexOf(found.weekday ?? '') + 1,
   }
}

const pad = (value: number) => String(value).padStart(2, '0')

// The calendar day of a moment in the account's zone, as YYYY-MM-DD.
export const dayKey = (date: Date, timeZone: string) => {
   const { year, month, day } = partsOf(date, timeZone)

   return `${year}-${pad(month)}-${pad(day)}`
}

// The moment a clock time on a calendar day happens in the zone. Two passes settle a change of offset around the time.
const localToDate = (year: number, month: number, day: number, minute: number, timeZone: string) => {
   const guess = Date.UTC(year, month - 1, day, 0, minute)
   const offsetAt = (time: number) => {
      const parts = partsOf(new Date(time), timeZone)

      return (
         Date.UTC(parts.year, parts.month - 1, parts.day, 0, parts.minute) - Math.floor(time / MINUTE_MS) * MINUTE_MS
      )
   }

   return new Date(guess - offsetAt(guess - offsetAt(guess)))
}

const worksOn = ({ days }: Pick<Office, 'days'>, weekday: number) => (days & (1 << (weekday - 1))) !== 0

// The next moment the office opens, after `now`.
export const nextOfficeStart = (now: Date, office: Office) => {
   const today = partsOf(now, office.timeZone)

   for (let ahead = 0; ahead <= 7; ahead += 1) {
      const date = new Date(Date.UTC(today.year, today.month - 1, today.day) + ahead * DAY_MS)
      const weekday = ((today.weekday - 1 + ahead) % 7) + 1
      const start = localToDate(
         date.getUTCFullYear(),
         date.getUTCMonth() + 1,
         date.getUTCDate(),
         office.startMinute,
         office.timeZone
      )

      if (worksOn(office, weekday) && start > now) {
         return start
      }
   }

   return new Date(now.getTime() + DAY_MS)
}

const refuse = (reason: AllowanceReason, until: Date): Allowance => ({
   ok: false,
   reason,
   until,
})

export const allowance = (input: AllowanceInput): Allowance => {
   const { now, office, capSeconds, usedSeconds, backgroundSeconds, klass, estimateSeconds, lastEndedAt, inFlight } =
      input

   if (klass === 'SYSTEM') {
      return { ok: true }
   }

   const today = partsOf(now, office.timeZone)
   const open = worksOn(office, today.weekday) && today.minute >= office.startMinute && today.minute < office.endMinute

   if (!open && !input.anyHour) {
      return refuse('OUTSIDE_OFFICE', nextOfficeStart(now, office))
   }

   if (inFlight) {
      return refuse('GAP', new Date(now.getTime() + GAP_MS))
   }

   if (lastEndedAt && now.getTime() - lastEndedAt.getTime() < GAP_MS) {
      return refuse('GAP', new Date(lastEndedAt.getTime() + GAP_MS))
   }

   if (usedSeconds >= capSeconds) {
      return refuse('DAY_FULL', nextOfficeStart(now, office))
   }

   if (klass === 'BACKGROUND' && backgroundSeconds + estimateSeconds > capSeconds * BACKGROUND_SHARE) {
      return refuse('BACKGROUND_FULL', nextOfficeStart(now, office))
   }

   // The even release is measured against the office window, so it only applies inside it.
   if (!open) {
      return { ok: true }
   }

   const opened = localToDate(today.year, today.month, today.day, office.startMinute, office.timeZone)
   const windowSeconds = (office.endMinute - office.startMinute) * 60
   const elapsed = (now.getTime() - opened.getTime()) / 1000
   const need = Math.min(usedSeconds + estimateSeconds, capSeconds)

   if (need > (capSeconds * elapsed) / windowSeconds + BURST_SECONDS) {
      const seconds = ((need - BURST_SECONDS) / capSeconds) * windowSeconds

      return refuse('TOO_SOON', new Date(opened.getTime() + Math.ceil(seconds) * 1000))
   }

   return { ok: true }
}

const clockOf = (minute: number) => `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`

// When a moment is, for the owner: "at 14:20", "tomorrow at 09:00", "on Mon 26 Oct at 09:00", in the account's zone.
export const whenText = (when: Date, now: Date, timeZone: string) => {
   const parts = partsOf(when, timeZone)
   const time = clockOf(parts.minute)
   const dayOffset = Math.round(
      (Date.UTC(parts.year, parts.month - 1, parts.day) -
         Date.UTC(partsOf(now, timeZone).year, partsOf(now, timeZone).month - 1, partsOf(now, timeZone).day)) /
         DAY_MS
   )

   if (dayOffset <= 0) {
      return `at ${time}`
   }

   if (dayOffset === 1) {
      return `tomorrow at ${time}`
   }

   const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

   return `on ${WEEKDAYS[parts.weekday - 1]} ${parts.day} ${months[parts.month - 1]} at ${time}`
}

// The calendar days of the last `count` days ending on `today` (YYYY-MM-DD), oldest first.
export const lastDayKeys = (today: string, count: number) => {
   const [year = 0, month = 1, day = 1] = today.split('-').map(Number)
   const end = Date.UTC(year, month - 1, day)

   return Array.from({ length: count }, (_, index) =>
      new Date(end - (count - 1 - index) * DAY_MS).toISOString().slice(0, 10)
   )
}

// ISO weekday of a YYYY-MM-DD day: 1 is Monday, 7 is Sunday.
export const weekdayOfKey = (key: string) => new Date(`${key}T00:00:00Z`).getUTCDay() || 7

export const isWorkingDay = worksOn

export const isTimeZone = (timeZone: string) => {
   try {
      new Intl.DateTimeFormat('en-US', { timeZone })

      return true
   } catch {
      return false
   }
}

const MODE_LABEL: Record<BrowseMode, string> = {
   SAFE: 'Safe',
   MODERATE: 'Moderate',
   AGGRESSIVE: 'Aggressive',
}

const lengthText = (minutes: number) => {
   const hours = Math.floor(minutes / 60)
   const rest = minutes % 60

   return hours === 0 ? `${rest} min` : rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

// Why these hours cannot be kept with this mode, or undefined when they can: the window must hold the day's minutes.
export const hoursProblem = (mode: BrowseMode, office: Pick<Office, 'days' | 'startMinute' | 'endMinute'>) => {
   if (office.days === 0) {
      return 'Pick at least one working day.'
   }

   if (office.endMinute <= office.startMinute) {
      return 'Working hours must end after they start.'
   }

   const minutes = BROWSE_MINUTES[mode]

   return office.endMinute - office.startMinute < minutes
      ? `${MODE_LABEL[mode]} needs at least ${lengthText(minutes)} of working time.`
      : undefined
}

// Mon..Sun as ISO weekdays 1..7, and back, for the web app.
export const daysToBits = (days: number[]) => days.reduce((bits, day) => bits | (1 << (day - 1)), 0)

export const bitsToDays = (bits: number) => [1, 2, 3, 4, 5, 6, 7].filter(day => (bits & (1 << (day - 1))) !== 0)
