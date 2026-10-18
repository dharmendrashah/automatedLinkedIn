// When an item was added, for the table filters. Each start is a local midnight, so it stays the same all day.

export const ADDED_FILTERS = {
   any: 'Added any time',
   today: 'Added today',
   week: 'Added this week',
   '30d': 'Added in the last 30 days',
} as const

export type AddedFilter = keyof typeof ADDED_FILTERS

export const isAddedFilter = (value: string | null): value is AddedFilter =>
   value !== null && Object.keys(ADDED_FILTERS).includes(value)

export const addedSince = (added: AddedFilter, now: Date = new Date()) => {
   if (added === 'any') {
      return undefined
   }

   const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())

   // Weeks start on Monday.
   if (added === 'week') {
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
   } else if (added === '30d') {
      start.setDate(start.getDate() - 30)
   }

   return start.toISOString()
}
