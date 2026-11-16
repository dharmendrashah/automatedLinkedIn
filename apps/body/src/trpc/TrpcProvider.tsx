import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink, httpLink, splitLink } from '@trpc/client'
import { type ReactNode, useEffect, useState } from 'react'
import { useAuth } from 'react-oidc-context'

import { userManager } from '../auth/userManager'
import { authHeadersOf } from './authHeaders'
import { createTrpcUrl } from './config'
import { newCorrelationId } from './correlationId'
import { failedRequestLink, stampCorrelation } from './requestErrors'
import { trpc } from './trpc'
import { isUnbatched } from './unbatched'

// The headers of one HTTP request, batched or not: the auth header and the ID its operations carry.
const headersFor = async (ops: ReadonlyArray<{ path: string; context: Record<string, unknown> }>) => {
   const correlationId = newCorrelationId()

   stampCorrelation(ops, correlationId)

   return {
      ...(await authHeadersOf(userManager)),
      'x-correlation-id': correlationId,
   }
}

export const TrpcProvider = ({ children }: { children: ReactNode }) => {
   const [queryClient] = useState(() => new QueryClient())

   const [client] = useState(() => {
      const url = createTrpcUrl(import.meta.env)

      return trpc.createClient({
         links: [
            failedRequestLink(),
            splitLink({
               condition: isUnbatched,
               true: httpLink({
                  url,
                  headers: ({ op }) => headersFor([op]),
               }),
               false: httpBatchLink({
                  url,
                  headers: ({ opList }) => headersFor(opList),
               }),
            }),
         ],
      })
   })

   const sub = useAuth().user?.profile.sub

   // Never show one user's cached API data to the next person who signs in.
   useEffect(() => {
      queryClient.clear()
   }, [queryClient, sub])

   return (
      <trpc.Provider client={client} queryClient={queryClient}>
         <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </trpc.Provider>
   )
}
