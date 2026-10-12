import { type RouterOutputs } from '../../trpc'

export type SessionRow = RouterOutputs['session']['list']['items'][number]
export type SessionDetail = RouterOutputs['session']['get']
export type SessionStatus = SessionRow['status']
