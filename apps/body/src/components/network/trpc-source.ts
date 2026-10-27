import { TRPCClientError } from '@trpc/client'

import { type trpc } from '../../trpc/trpc'
import { isBudgetRefusal } from '../accounts/budget-refusal'
import { NetworkRefusal, type NetworkSource } from './source'

// The part of the tRPC client the page uses, as the client of the app gives it (`trpc.useUtils().client`).
export type NetworkClient = ReturnType<typeof trpc.useUtils>['client']

// A refusal brain wrote as a sentence (a limit, an account that is busy) is told as it is, and the one the owner may go past (the browse
// budget) says so. Anything else is a failure and is left to the caller.
const refusal = (error: unknown): never => {
   if (error instanceof TRPCClientError && error.data?.code === 'PRECONDITION_FAILED') {
      throw new NetworkRefusal(error.message, isBudgetRefusal(error))
   }

   throw error
}

// The real source: brain's `network` router, which asks the spider to read and to answer.
export const createTrpcSource = (client: NetworkClient): NetworkSource => ({
   key: 'live',
   load: accountIds => client.network.list.query({ accountIds }),
   waiting: accountIds => client.network.waiting.query({ accountIds }),
   refresh: (accountIds, { startAnyway }) => client.network.refresh.mutate({ accountIds, startAnyway }),
   answer: async (accountId, answers, { startAnyway }) => {
      await client.network.answer.mutate({ accountId, answers, startAnyway }).catch(refusal)
   },
})
