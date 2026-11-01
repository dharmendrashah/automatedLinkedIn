import { timeAgo } from '../../lib/time-ago'

// When it was posted as "3 days ago" when LinkedIn gave a date, else as LinkedIn wrote it.
export const postedText = (value: string | null, now = new Date()) =>
   value === null ? null : Number.isNaN(Date.parse(value)) ? value : timeAgo(value, now)
