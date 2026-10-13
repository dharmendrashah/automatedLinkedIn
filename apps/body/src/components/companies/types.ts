import { type RouterOutputs } from '../../trpc'

export type Company = RouterOutputs['linkedInCompany']['list']['items'][number]
