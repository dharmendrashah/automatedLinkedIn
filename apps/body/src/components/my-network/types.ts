import { type RouterOutputs } from '../../trpc'

export type Client = RouterOutputs['people']['clients'][number]
export type PersonRow = RouterOutputs['people']['list']['items'][number]
export type Person = RouterOutputs['people']['get']
export type TodayLine = RouterOutputs['people']['today'][number]
