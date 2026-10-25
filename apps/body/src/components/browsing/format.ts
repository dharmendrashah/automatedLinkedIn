import { type BrowseMode, type BrowseState, type WorkingHours } from './types'

import { modeOf } from './modes'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const LONG_DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// "42 min", "1 h 12 min", "2 h". Under a minute of something reads "less than 1 min", so a tiny session is not shown as zero.
export const formatMinutes = (seconds: number) => {
   if (seconds <= 0) {
      return '0 min'
   }

   const minutes = Math.round(seconds / 60)

   if (minutes < 1) {
      return 'less than 1 min'
   }

   const hours = Math.floor(minutes / 60)
   const rest = minutes % 60

   return hours === 0 ? `${rest} min` : rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

// "42 of 90 min".
export const meterText = (usedSeconds: number, limitSeconds: number) =>
   `${Math.round(usedSeconds / 60)} of ${Math.round(limitSeconds / 60)} min`

export const clock = (minute: number) =>
   `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

// The longest runs of consecutive days read as a range: "Mon to Fri", "Mon, Wed and Fri", "every day".
const daysText = (days: number[], names: string[]) => {
   const sorted = [...new Set(days)].sort((a, b) => a - b)

   if (sorted.length === 7) {
      return 'every day'
   }

   const runs: number[][] = []

   for (const day of sorted) {
      const last = runs[runs.length - 1]

      if (last && last[last.length - 1] === day - 1) {
         last.push(day)
      } else {
         runs.push([day])
      }
   }

   const parts = runs.flatMap(run =>
      run.length >= 3
         ? [`${names[(run[0] ?? 1) - 1]} to ${names[(run[run.length - 1] ?? 1) - 1]}`]
         : run.map(day => names[day - 1])
   )

   return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : (parts[0] ?? '')
}

// "09:00 to 18:00, Mon to Fri, Asia/Kolkata".
export const hoursText = (hours: WorkingHours) =>
   `${clock(hours.startMinute)} to ${clock(hours.endMinute)}, ${daysText(hours.days, DAY_NAMES)}, ${hours.timeZone}`

// What the hours mean for the day: "Spread evenly from 09:00 to 18:00, Monday to Friday (Asia/Kolkata): about 10 minutes an hour."
export const spreadSentence = (mode: BrowseMode, hours: WorkingHours) => {
   const windowHours = (hours.endMinute - hours.startMinute) / 60
   const perHour = windowHours > 0 ? Math.max(1, Math.round(modeOf(mode).minutes / windowHours)) : 0

   return `Spread evenly from ${clock(hours.startMinute)} to ${clock(hours.endMinute)}, ${daysText(hours.days, LONG_DAY_NAMES)} (${hours.timeZone}): about ${perHour} minutes an hour.`
}

// Why these hours cannot be saved with this mode, or undefined when they can.
export const hoursProblem = (mode: BrowseMode, hours: WorkingHours) => {
   if (hours.days.length === 0) {
      return 'Pick at least one working day.'
   }

   if (hours.endMinute <= hours.startMinute) {
      return 'Working hours must end after they start.'
   }

   const { label, minutes } = modeOf(mode)

   return hours.endMinute - hours.startMinute < minutes
      ? `${label} needs at least ${formatMinutes(minutes * 60)} of working time.`
      : undefined
}

// One sentence for what the account can do right now.
export const stateText = ({ state, nextAt }: { state: BrowseState; nextAt: string | null }) => {
   switch (state) {
      case 'OPEN':
         return 'Open. A session can start now.'
      case 'WAITING_FOR_SLOT':
         return `Open. The next session starts at ${nextAt}.`
      case 'DAY_FULL':
         return `Today's limit is used. Browsing resumes ${nextAt}.`
      case 'OUTSIDE_HOURS':
         return `Outside working hours. Browsing resumes ${nextAt}.`
      default:
         return 'Not browsing. The account is paused or needs attention.'
   }
}
