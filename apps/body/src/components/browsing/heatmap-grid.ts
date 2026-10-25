import { type DayUsage } from './types'

import { formatMinutes } from './format'

export type Level = 0 | 1 | 2 | 3 | 4 | 'over'

export type YearCell = DayUsage

export type YearGrid = {
   // 53 weeks, Monday first. A day after the last day is null.
   weeks: (YearCell | null)[][]
   months: { label: string; week: number }[]
}

const WEEKS = 53
const DAY_MS = 86_400_000
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// Closer labels would overlap.
const MIN_MONTH_GAP = 3

const toTime = (day: string) => {
   const [year = 0, month = 1, date = 1] = day.split('-').map(Number)

   return Date.UTC(year, month - 1, date)
}

const toDay = (time: number) => new Date(time).toISOString().slice(0, 10)

export const dayLabel = (day: string) => {
   const date = new Date(toTime(day))

   return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`
}

// ISO weekday of a day: 1 is Monday, 7 is Sunday.
export const weekdayOf = (day: string) => new Date(toTime(day)).getUTCDay() || 7

// The last `count` days ending on `today`, oldest first.
export const lastDays = (today: string, count: number) =>
   Array.from({ length: count }, (_, index) => toDay(toTime(today) - (count - 1 - index) * DAY_MS))

// The share of the day's own limit as one of five steps, or 'over' once the limit is passed.
export const levelOf = (seconds: number, limitSeconds: number): Level => {
   if (seconds <= 0) {
      return 0
   }

   const share = seconds / limitSeconds

   return share > 1 ? 'over' : share > 0.75 ? 4 : share > 0.5 ? 3 : share > 0.25 ? 2 : 1
}

export const buildYear = (days: DayUsage[], lastDay: string): YearGrid => {
   const byDay = new Map(days.map(item => [item.day, item]))
   const last = toTime(lastDay)
   const mondayOffset = (new Date(last).getUTCDay() + 6) % 7
   const firstMonday = last - mondayOffset * DAY_MS - (WEEKS - 1) * 7 * DAY_MS

   const weeks = Array.from({ length: WEEKS }, (_, week) =>
      Array.from({ length: 7 }, (_, weekday) => {
         const time = firstMonday + (week * 7 + weekday) * DAY_MS

         if (time > last) {
            return null
         }

         const day = toDay(time)

         return byDay.get(day) ?? { day, seconds: 0, sessions: 0, limitSeconds: 0 }
      })
   )

   const starts: { label: string; week: number }[] = []
   let previous = -1

   weeks.forEach((week, index) => {
      const month = new Date(toTime(week[0]?.day ?? lastDay)).getUTCMonth()

      if (month !== previous) {
         starts.push({ label: MONTHS[month] ?? '', week: index })
         previous = month
      }
   })

   const months = starts.filter((start, index) => {
      const next = starts[index + 1]

      return !next || next.week - start.week >= MIN_MONTH_GAP
   })

   return { weeks, months }
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

export const tooltipText = ({ day, seconds, sessions, limitSeconds }: DayUsage) => {
   if (seconds <= 0) {
      return `${dayLabel(day)}: no browsing`
   }

   const limit = Math.round(limitSeconds / 60)
   const count = plural(sessions, 'session')

   if (seconds > limitSeconds) {
      return `${dayLabel(day)}: ${formatMinutes(seconds)} of ${limit} min, over the limit, ${count}`
   }

   const share = Math.round((seconds / limitSeconds) * 100)

   return `${dayLabel(day)}: ${Math.round(seconds / 60)} min of ${limit} (${share}%), ${count}`
}

export const summaryText = (days: DayUsage[]) => {
   const active = days.filter(({ seconds }) => seconds > 0)

   if (active.length === 0) {
      return 'Nothing browsed yet'
   }

   const total = active.reduce((sum, { seconds }) => sum + seconds, 0)
   const busiest = Math.max(...active.map(({ seconds }) => seconds))

   return `${formatMinutes(total)} · ${plural(active.length, 'active day')} · busiest day ${formatMinutes(busiest)}`
}
