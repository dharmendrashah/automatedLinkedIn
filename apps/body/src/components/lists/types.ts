import { type RouterOutputs } from '../../trpc'

export type ListSummary = RouterOutputs['workflowList']['lists'][number]
export type Member = RouterOutputs['workflowList']['members']['items'][number]
export type MemberState = Member['state']
export type MemberStatus = Member['status']

export const memberStatuses: Record<MemberStatus, { label: string }> = {
   NEW: { label: 'New' },
   IN_REVIEW: { label: 'In review' },
   DONE: { label: 'Done' },
   NOT_A_FIT: { label: 'Not a fit' },
}

export const memberStates: Record<MemberState, { label: string }> = {
   QUALIFIED: { label: 'Qualified' },
   MAYBE: { label: 'Maybe' },
}

export const isMemberStatus = (value: string): value is MemberStatus => value in memberStatuses
export const isMemberState = (value: string): value is MemberState => value in memberStates

// The first reason a workflow found the person, in words: the comment they wrote, or that they reacted.
export const reasonOf = ([first]: Member['signals']) => {
   if (first?.type === 'commented') {
      return first.excerpt ? `Commented: "${first.excerpt}"` : 'Commented on a post'
   }

   return first?.type === 'reacted' ? 'Reacted to a post' : 'A post they engaged with'
}
