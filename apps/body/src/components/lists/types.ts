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
   UNSCORED: { label: 'Unscored' },
}

// The views of a list: everyone, or one band. People added without scoring show only in All.
export const LIST_VIEWS = {
   ALL: 'All',
   QUALIFIED: 'Qualified',
   MAYBE: 'Maybe',
} as const

export type ListView = keyof typeof LIST_VIEWS

export const isListView = (value: string): value is ListView => value in LIST_VIEWS

// States a person can be set to by hand.
export type SettableState = Exclude<MemberState, 'UNSCORED'>

export const isMemberStatus = (value: string): value is MemberStatus => value in memberStatuses
export const isSettableState = (value: string): value is SettableState => value === 'QUALIFIED' || value === 'MAYBE'

// The first reason a workflow found the person, in words: the comment they wrote, that they reacted, or the company.
export const reasonOf = ([first]: Member['signals']) => {
   if (first?.type === 'commented') {
      return first.excerpt ? `Commented: "${first.excerpt}"` : 'Commented on a post'
   }

   if (first?.type === 'employee' || first?.type === 'hiring') {
      return first.type === 'hiring' ? `Company is hiring: ${first.excerpt ?? ''}` : 'Works at a target company'
   }

   return first?.type === 'reacted' ? 'Reacted to a post' : 'A post they engaged with'
}
