import { useMemo } from 'react'

import { trpc } from '../../trpc'

// The ids of the accounts that have a proxy that works; undefined while the proxies load.
export const useAccountsWithProxy = () => {
   const proxies = trpc.proxyServer.list.useQuery(undefined, { retry: false })

   return useMemo(
      () =>
         proxies.data
            ? new Set(
                 proxies.data
                    .filter(proxy => proxy.status === 'ACTIVE' || proxy.status === 'GEO_MISMATCH')
                    .map(proxy => proxy.linkedInAccountId)
              )
            : undefined,
      [proxies.data]
   )
}
