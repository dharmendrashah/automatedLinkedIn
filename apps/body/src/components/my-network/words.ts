import { type Fit } from './address'

// The plain words My network uses for what brain stores.

export type PersonStatus = 'NEW' | 'CONTACTED' | 'REPLIED' | 'NOT_INTERESTED' | 'DONE'

export const STATUSES: Array<[PersonStatus, string]> = [
   ['NEW', 'New'],
   ['CONTACTED', 'Contacted'],
   ['REPLIED', 'Replied'],
   ['NOT_INTERESTED', 'Not interested'],
   ['DONE', 'Done'],
]

export const statusWord = (status: string) => STATUSES.find(([value]) => value === status)?.[1] ?? status

export const isStatus = (value: string): value is PersonStatus => STATUSES.some(([status]) => status === value)

export const FIT_WORDS: Record<Fit, string> = {
   STRONG: 'Strong',
   MAYBE: 'Maybe',
   NONE: 'None',
}

export const LINK_WORDS: Record<string, string> = {
   REQUEST: 'Sent a connection request',
   CONNECTION: 'Connected',
   CONVERSATION: 'Conversation',
   LIST_MEMBER: 'Added to a list',
   TARGET: 'Target profile',
   INVITE: 'Invited',
}

export const INVITE_STATE_WORDS: Record<string, string> = {
   QUEUED: 'Invite queued',
   SENDING: 'Invite being sent',
   SENT: 'Invite sent',
   ACCEPTED: 'Invite accepted',
   WITHDRAW_QUEUED: 'To be withdrawn',
   WITHDRAWING: 'Being withdrawn',
   WITHDRAWN: 'Invite withdrawn',
   FAILED: 'Invite not sent',
   UNKNOWN: 'Invite may have been sent',
   CANCELLED: 'Invite cancelled',
}

// A person not read yet has only their profile name.
export const nameOf = ({ name, slug }: { name: string | null; slug: string }) => name ?? slug

const SOURCES: Record<string, string> = {
   request: 'Requests',
   connection: 'Connections',
   target: 'Target profiles',
}

// "Requests", "Connections", "Target profiles" or the list's own name.
export const foundByWord = (source: string, lists: Array<{ id: string; name: string }>) =>
   SOURCES[source] ??
   (source.startsWith('list:') ? (lists.find(({ id }) => `list:${id}` === source)?.name ?? 'A list') : source)
