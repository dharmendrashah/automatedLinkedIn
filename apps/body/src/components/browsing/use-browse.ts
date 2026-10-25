import { useMemo, useState, useSyncExternalStore } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { type AccountBrowse } from './types'

import { trpc } from '../../trpc'
import { type Override, type SampleAccount, buildBrowse, sampleKindOf } from './sample'

const OVERVIEW_POLL_MS = 60_000

// With `?browse=` in the address the screens show invented data (.plan/account-browsing-ui.md); the owner's changes to it are
// kept for the whole visit, so a change on the Accounts page is still there on the account's own page. Without it they show
// what brain serves.
let overrides: Record<string, Override> = {}
const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
   listeners.add(listener)

   return () => {
      listeners.delete(listener)
   }
}

const snapshot = () => overrides

const replace = (next: Record<string, Override>) => {
   overrides = next
   listeners.forEach(listener => listener())
}

// Changes the sample accounts at once.
const changeSample = (accounts: AccountBrowse[], change: Override) => {
   const ids = accounts.map(({ accountId }) => accountId)

   replace({
      ...overrides,
      ...Object.fromEntries(ids.map(id => [id, { ...overrides[id], ...change }])),
   })
}

export const countText = (accounts: AccountBrowse[]) =>
   accounts.length === 1 ? (accounts[0]?.email ?? '') : `${accounts.length} accounts`

// The browsing data of the accounts, and what to ask brain when the owner changes them.
export const useBrowsing = (accounts: SampleAccount[] | undefined) => {
   const [params] = useSearchParams()
   const kind = sampleKindOf(params.get('browse'))
   const current = useSyncExternalStore(subscribe, snapshot)
   const [now] = useState(() => new Date())
   const overview = trpc.browse.overview.useQuery(undefined, {
      enabled: kind === null,
      retry: false,
      refetchInterval: OVERVIEW_POLL_MS,
   })

   const byId = useMemo(() => {
      if (kind) {
         return accounts
            ? new Map(accounts.map(account => [account.id, buildBrowse(kind, account, now, current[account.id])]))
            : undefined
      }

      return overview.data ? new Map(overview.data.map(item => [item.accountId, item])) : undefined
   }, [kind, accounts, now, current, overview.data])

   return {
      kind,
      byId,
      now,
      loading: kind === null && overview.isPending,
      error: kind === null ? overview.error?.message : undefined,
   }
}

// What an account had before a change, for the fields that were changed.
const restoreOf = (account: AccountBrowse, keys: string[]): Override => ({
   ...(keys.includes('mode') && { mode: account.mode }),
   ...(keys.includes('hours') && { hours: account.hours }),
   ...(keys.includes('clientLabel') && { clientLabel: account.clientLabel }),
})

// Changes the accounts and offers an Undo that puts each one back as it was. With sample data nothing is sent.
export const useBrowseChange = (sample: boolean) => {
   const utils = trpc.useUtils()
   const mutation = trpc.browse.change.useMutation()
   const refresh = () => void utils.browse.overview.invalidate()

   return (accounts: AccountBrowse[], change: Override, message: string) => {
      const keys = Object.keys(change)
      const undo = () => {
         if (sample) {
            replace({
               ...overrides,
               ...Object.fromEntries(accounts.map(account => [account.accountId, restoreOf(account, keys)])),
            })

            return
         }

         void Promise.all(
            accounts.map(account =>
               mutation.mutateAsync({
                  accountIds: [account.accountId],
                  ...restoreOf(account, keys),
               })
            )
         )
            .then(refresh)
            .catch((error: Error) => toast.error(error.message))
      }

      if (sample) {
         changeSample(accounts, change)
         toast(message, { action: { label: 'Undo', onClick: undo } })

         return
      }

      mutation.mutate(
         {
            accountIds: accounts.map(({ accountId }) => accountId),
            ...change,
         },
         {
            onSuccess: () => {
               refresh()
               toast(message, { action: { label: 'Undo', onClick: undo } })
            },
            onError: error => toast.error(error.message),
         }
      )
   }
}
