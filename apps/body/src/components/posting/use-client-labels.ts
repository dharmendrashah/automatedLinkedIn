import { useMemo } from 'react'

import { trpc } from '../../trpc'
import type { Labels } from './landing'

// The client label the owner gave each account (set on the accounts page), by account id. Empty while it loads or when brain does
// not answer: the page then shows no label, never a wrong one.
export const useClientLabels = (): Labels => {
   const overview = trpc.browse.overview.useQuery(undefined, {
      retry: false,
      staleTime: 60_000,
   })

   return useMemo(() => new Map((overview.data ?? []).map(item => [item.accountId, item.clientLabel])), [overview.data])
}
