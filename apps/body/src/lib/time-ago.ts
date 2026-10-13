const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? '' : 's'} ago`

// "just now", "5 minutes ago", "3 hours ago", "2 days ago": how long ago, for a person.
export const timeAgo = (value: string | Date | null, now: Date = new Date()) => {
   if (!value) return 'never'

   const elapsed = now.getTime() - new Date(value).getTime()

   if (elapsed < MINUTE) return 'just now'
   if (elapsed < HOUR) return plural(Math.floor(elapsed / MINUTE), 'minute')
   if (elapsed < DAY) return plural(Math.floor(elapsed / HOUR), 'hour')

   return plural(Math.floor(elapsed / DAY), 'day')
}
