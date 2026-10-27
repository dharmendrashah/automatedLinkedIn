import { useNow } from '@/hooks/use-now'
import { useMemo } from 'react'

import { type AccountBrowse } from '../browsing/types'
import { type Account } from './types'

import { trpc } from '../../trpc'
import { resultOf } from '../sessions/describe'
import { useTaskCatalog } from '../sessions/use-task-catalog'
import { type ItemName, type ItemState, itemState } from './today'

// The task each item stands for, so a run is named and judged with the worker's own labels.
const TASK_OF: Record<ItemName, string> = {
   login: 'linkedin-login',
   visit: 'linkedin-browse',
   messages: 'linkedin-messages',
   network: 'linkedin-invitations',
}

const POLL_RUNNING_MS = 3000
const POLL_MS = 60_000
const CLOCK_MS = 30_000

const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

// What each account did today and what is next, in the state of its four items. Asked again every 3 seconds while a run goes on and
// every minute otherwise; the states are worked out again as the clock moves, in each account's own day.
export const useToday = (accounts: Account[] | undefined, byId: Map<string, AccountBrowse> | undefined) => {
   const catalog = useTaskCatalog()
   const now = useNow(CLOCK_MS)
   const query = trpc.linkedInAccount.today.useQuery(undefined, {
      retry: false,
      refetchInterval: current =>
         current.state.data?.some(({ items }) => items.some(({ last }) => last?.status === 'IN_PROGRESS'))
            ? POLL_RUNNING_MS
            : POLL_MS,
   })

   const statesById = useMemo(() => {
      if (!query.data || !accounts) {
         return undefined
      }

      const states = new Map<string, ItemState[]>()

      for (const entry of query.data) {
         const account = accounts.find(({ id }) => id === entry.accountId)

         if (account) {
            const zone = byId?.get(account.id)?.hours.timeZone ?? localZone()

            states.set(
               account.id,
               entry.items.map(facts =>
                  itemState(facts, {
                     now,
                     zone,
                     status: account.status,
                     lastVerifiedAt: account.lastVerifiedAt,
                     firstRead: entry.firstRead,
                     resultOf: run =>
                        resultOf(
                           {
                              status: run.status,
                              noAnswer: false,
                              kind: 'TASK',
                              task: TASK_OF[facts.item],
                              verdict: run.verdict,
                           },
                           catalog
                        ),
                  })
               )
            )
         }
      }

      return states
   }, [query.data, accounts, byId, catalog, now])

   return {
      statesById,
      now,
      loading: query.isPending,
      error: query.error?.message,
      retry: () => void query.refetch(),
   }
}
