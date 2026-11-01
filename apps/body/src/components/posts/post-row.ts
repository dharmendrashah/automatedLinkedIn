import { timeAgo } from '../../lib/time-ago'

// Words of the Posts page (.plan/posts-page-redesign.md), kept pure so they are tested.

export type PostSummary = { toWork: number; done: number; unread: number; found: number; qualified: number }

const countOf = (count: number, one: string, many: string) => `${count.toLocaleString('en')} ${count === 1 ? one : many}`

// People first: they are why the page exists.
export const summaryLine = ({ toWork, unread, found, qualified }: PostSummary) =>
   [
      found > 0
         ? `${countOf(found, 'person', 'people')} found, ${qualified.toLocaleString('en')} qualified`
         : 'Nobody found from your posts yet',
      `${countOf(toWork, 'post', 'posts')} to work through${unread > 0 ? `, ${unread.toLocaleString('en')} not read yet` : ''}`,
   ].join(' · ')

// When it was posted as "3 days ago" when LinkedIn gave a date, else as LinkedIn wrote it.
export const postedText = (value: string | null, now = new Date()) =>
   value === null ? null : Number.isNaN(Date.parse(value)) ? value : timeAgo(value, now)
