import { type View } from './types'

const LABELS: Record<View, string> = {
   ALL: 'All',
   NEEDS_REPLY: 'Needs reply',
   UNREAD: 'Unread',
   REPLIED: 'Replied',
   DRAFTS: 'Drafts',
   FAILED: 'Failed',
   DONE: 'Done',
}

export const viewLabel = (view: View) => LABELS[view]
