import { useMemo, useState, useSyncExternalStore } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { type AccountBrowse } from './types'

import { type Override, type SampleAccount, buildBrowse, sampleKindOf } from './sample'

// The owner's changes to the sample data, kept for the whole visit so a change on the Accounts page is still there on the
// account's own page. Replaced by the real endpoints once brain serves them.
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

// Changes the given accounts at once and offers an Undo that puts each one back as it was.
export const changeBrowse = (ids: string[], change: Override, message: string) => {
   const before = ids.map(id => [id, overrides[id]] as const)

   replace({
      ...overrides,
      ...Object.fromEntries(ids.map(id => [id, { ...overrides[id], ...change }])),
   })

   toast(message, {
      action: {
         label: 'Undo',
         onClick: () => {
            const restored = { ...overrides }

            before.forEach(([id, previous]) => {
               if (previous) {
                  restored[id] = previous
               } else {
                  delete restored[id]
               }
            })
            replace(restored)
         },
      },
   })
}

export const countText = (accounts: AccountBrowse[]) =>
   accounts.length === 1 ? (accounts[0]?.email ?? '') : `${accounts.length} accounts`

// The browsing data of the given accounts while `?browse=` is in the address; undefined otherwise.
export const useBrowsing = (accounts: SampleAccount[] | undefined) => {
   const [params] = useSearchParams()
   const kind = sampleKindOf(params.get('browse'))
   const current = useSyncExternalStore(subscribe, snapshot)
   const [now] = useState(() => new Date())

   const byId = useMemo(
      () =>
         kind && accounts
            ? new Map(accounts.map(account => [account.id, buildBrowse(kind, account, now, current[account.id])]))
            : undefined,
      [kind, accounts, now, current]
   )

   return { kind, byId, now }
}
