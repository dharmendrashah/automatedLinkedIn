import { type RouterOutputs } from '../../trpc'

export type Workspace = RouterOutputs['people']['workspace']
export type PersonRow = RouterOutputs['people']['list']['items'][number]
export type Person = RouterOutputs['people']['get']
export type TodayLine = RouterOutputs['people']['today']
