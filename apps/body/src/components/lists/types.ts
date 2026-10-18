import { timeAgo } from '@/lib/time-ago'

import { strongestSignal } from './message'

import { type RouterOutputs } from '../../trpc'

export type ListSummary = RouterOutputs['workflowList']['lists'][number]
export type Inbox = RouterOutputs['workflowList']['inbox']
export type InboxMember = Inbox['items'][number]
export type InboxView = keyof Inbox['counts']
export type Fit = InboxMember['state']
type Signal = InboxMember['signals'][number]

// The statuses a person can be set to; In review and Done were folded into New and Contacted.
export type MemberStatus = 'NEW' | 'CONTACTED' | 'REPLIED' | 'NOT_A_FIT'

export const memberStatuses: Record<MemberStatus, { label: string }> = {
   NEW: { label: 'To do' },
   CONTACTED: { label: 'Contacted' },
   REPLIED: { label: 'Replied' },
   NOT_A_FIT: { label: 'Not a fit' },
}

export const isMemberStatus = (value: string): value is MemberStatus => value in memberStatuses

// Statuses from before the one status flow: Done was contacted, In review was still to do.
export const workStatus = (status: InboxMember['status']): MemberStatus =>
   status === 'DONE' ? 'CONTACTED' : isMemberStatus(status) ? status : 'NEW'

export const INBOX_TABS: Record<InboxView, string> = {
   TODO: 'To do',
   CONTACTED: 'Contacted',
   REPLIED: 'Replied',
   NOT_A_FIT: 'Not a fit',
   ALL: 'All',
}

export const isInboxView = (value: string): value is InboxView => value in INBOX_TABS

export const FITS: Record<Fit, { label: string; className: string }> = {
   QUALIFIED: {
      label: 'Strong fit',
      className: 'bg-success/10 text-success border-transparent',
   },
   MAYBE: {
      label: 'Maybe',
      className: 'bg-warning/10 text-warning border-transparent',
   },
   UNSCORED: {
      label: 'No score yet',
      className: 'text-muted-foreground',
   },
}

export const isFit = (value: string): value is Fit => value in FITS

// The fit a person added by hand starts with.
export type SettableState = Exclude<Fit, 'UNSCORED'>
export const memberStates = FITS
export const isSettableState = (value: string): value is SettableState => value === 'QUALIFIED' || value === 'MAYBE'

// One signal in words, with how long ago when it is known.
export const signalText = (signal: Signal) => {
   const when = signal.at ? ` ${timeAgo(signal.at)}` : ''

   if (signal.type === 'commented') return `Commented on a post${when}`
   if (signal.type === 'reacted') return `Reacted to a post${when}`
   if (signal.type === 'hiring') return `Company is hiring${signal.excerpt ? `: ${signal.excerpt}` : ''}`

   return 'Works at a target company'
}

// The one line a row shows: their role, then the strongest reason they were found.
export const reasonLine = (member: Pick<InboxMember, 'title' | 'company' | 'headline' | 'signals'>) => {
   const role = member.title ? [member.title, member.company].filter(Boolean).join(' at ') : member.headline
   const signal = strongestSignal(member.signals)

   return {
      role,
      signal: signal ? signalText(signal) : 'Added by hand',
      link: signal?.via ?? null,
   }
}
