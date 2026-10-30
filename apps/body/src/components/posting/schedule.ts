// Planning a time for a post: the clock of a chosen zone, with no date library. A time is kept as an instant (ISO text) and the zone
// it was chosen in, which is only how it is shown.

export type Wall = {
   year: number
   month: number
   day: number
   hour: number
   minute: number
}

export const MIN_LEAD_MS = 10 * 60 * 1000

const MINUTE = 60 * 1000
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

// The clock of a zone at an instant; `weekday` is 0 for Sunday.
export const wallOf = (instant: Date, zone: string) => {
   const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      weekday: 'short',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
   }).formatToParts(instant)
   const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(found => found.type === type)?.value ?? ''

   return {
      year: Number(part('year')),
      month: Number(part('month')),
      day: Number(part('day')),
      hour: Number(part('hour')),
      minute: Number(part('minute')),
      weekday: WEEKDAYS.indexOf(part('weekday')),
   }
}

const utcOf = ({ year, month, day, hour, minute }: Wall) => Date.UTC(year, month - 1, day, hour, minute)

const offsetAt = (instantMs: number, zone: string) => {
   const minuteStart = Math.floor(instantMs / MINUTE) * MINUTE

   return utcOf(wallOf(new Date(minuteStart), zone)) - minuteStart
}

// The instant a clock shows in a zone. Undefined for a time that does not exist there (the clocks jump over it) or a day that is
// not in the calendar; a time that happens twice gives one of the two.
export const instantOf = (wall: Wall, zone: string) => {
   const guess = utcOf(wall)
   const first = guess - offsetAt(guess, zone)
   const instant = new Date(guess - offsetAt(first, zone))
   const back = wallOf(instant, zone)

   return back.year === wall.year &&
      back.month === wall.month &&
      back.day === wall.day &&
      back.hour === wall.hour &&
      back.minute === wall.minute
      ? instant
      : undefined
}

const pad = (value: number) => String(value).padStart(2, '0')

// The two boxes of the picker for an instant.
export const toInputs = (iso: string, zone: string) => {
   const { year, month, day, hour, minute } = wallOf(new Date(iso), zone)

   return {
      date: `${year}-${pad(month)}-${pad(day)}`,
      time: `${pad(hour)}:${pad(minute)}`,
   }
}

export const fromInputs = (date: string, time: string, zone: string) => {
   const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
   const clock = /^(\d{2}):(\d{2})$/.exec(time)

   if (!day || !clock) {
      return undefined
   }

   return instantOf(
      {
         year: Number(day[1]),
         month: Number(day[2]),
         day: Number(day[3]),
         hour: Number(clock[1]),
         minute: Number(clock[2]),
      },
      zone
   )
}

export const plannedProblem = (at: Date, now: Date) =>
   at.getTime() - now.getTime() < MIN_LEAD_MS ? 'Choose a time at least 10 minutes from now.' : undefined

const daysLater = (wall: Wall, days: number): Wall => {
   const moved = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + days))

   return {
      ...wall,
      year: moved.getUTCFullYear(),
      month: moved.getUTCMonth() + 1,
      day: moved.getUTCDate(),
   }
}

// Quick choices that are still ahead and differ from each other.
export const presets = (now: Date, zone: string) => {
   const today = wallOf(now, zone)
   const nextMonday = (1 - today.weekday + 7) % 7 || 7
   const choices = [
      {
         label: 'Later today',
         wall: {
            ...today,
            hour: 15,
            minute: 0,
         },
      },
      {
         label: 'Tomorrow morning',
         wall: {
            ...daysLater(today, 1),
            hour: 9,
            minute: 0,
         },
      },
      {
         label: 'Monday morning',
         wall: {
            ...daysLater(today, nextMonday),
            hour: 9,
            minute: 0,
         },
      },
   ]
   const seen = new Set<number>()

   return choices.flatMap(({ label, wall }) => {
      const at = instantOf(wall, zone)

      if (!at || plannedProblem(at, now) || seen.has(at.getTime())) {
         return []
      }

      seen.add(at.getTime())

      return [{ label, at }]
   })
}

// "Tuesday, Nov 3, 2026 at 9:00 AM (Asia/Kolkata)".
export const describePlanned = (iso: string, zone: string) =>
   `${new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
   }).format(new Date(iso))} (${zone})`
