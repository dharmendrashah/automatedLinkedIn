import { type RouterOutputs } from '../../trpc'

export type Account = RouterOutputs['linkedInAccount']['list'][number]
export type AccountStatus = Account['status']
