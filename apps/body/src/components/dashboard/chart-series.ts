import type { DashboardOverview, SeriesKey } from '@automatedLinkedIn/contracts'
import { plural } from '@automatedLinkedIn/contracts'

export type DayCount = 7 | 30 | 90
export type Totals = Record<SeriesKey, number>

// The draw order of the chart and of its description.
export const SERIES_KEYS: SeriesKey[] = ['found', 'qualified', 'invited', 'accepted']

const WORDS: Record<SeriesKey, string> = {
   found: 'found',
   qualified: 'qualified',
   invited: 'invited',
   accepted: 'accepted',
}

// The newest `dayCount` days. A gap day (null values) adds nothing; a partial day has some, not all, campaigns counted.
export const sliceSeries = (series: DashboardOverview['series'], dayCount: DayCount) => {
   const days = series.slice(-dayCount)
   const totals: Totals = {
      found: 0,
      qualified: 0,
      invited: 0,
      accepted: 0,
   }
   let partialDays = 0

   for (const day of days) {
      for (const key of SERIES_KEYS) {
         totals[key] += day[key] ?? 0
      }

      if (day.counted > 0 && day.counted < day.campaigns) {
         partialDays += 1
      }
   }

   return {
      days,
      totals,
      partialDays,
   }
}

export const chartDescription = ({
   totals,
   dayCount,
   partialDays,
   active,
}: {
   totals: Totals
   dayCount: DayCount
   partialDays: number
   active: ReadonlySet<SeriesKey>
}) => {
   const counts = SERIES_KEYS.filter(key => active.has(key)).map(key => `${WORDS[key]} ${totals[key]}`)
   const span = dayCount === 90 ? 'the last 3 months' : `the last ${dayCount} days`
   const partial = partialDays > 0 ? `, partial on ${plural(partialDays, 'day', 'days')}` : ''
   const text = `${counts.join(', ')} in ${span}${partial}`

   return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
}

// The last series on cannot be switched off.
export const toggleSeries = (active: ReadonlySet<SeriesKey>, key: SeriesKey) => {
   const next = new Set(active)

   if (!next.has(key)) {
      next.add(key)
   } else if (next.size > 1) {
      next.delete(key)
   }

   return next
}
