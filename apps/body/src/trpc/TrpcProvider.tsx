import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink } from '@trpc/client'
import { type ReactNode, useEffect, useState } from 'react'
import { useAuth } from 'react-oidc-context'

import { userManager } from '../auth/userManager'
import { authHeadersOf } from './authHeaders'
import { newCorrelationId } from './correlationId'
import { createTrpcUrl } from './config'
import { failedRequestLink, stampCorrelation } from './requestErrors'
import { trpc } from './trpc'

export const TrpcProvider = ({ children }: { children: ReactNode }) => {
   const [queryClient] = useState(() => new QueryClient())

   const [client] = useState(() =>
      trpc.createClient({
         links: [
            failedRequestLink(),
            httpBatchLink({
               url: createTrpcUrl(import.meta.env),
               headers: async ({ opList }) => {
                  const correlationId = newCorrelationId()

                  stampCorrelation(opList, correlationId)

                  return {
                     ...(await authHeadersOf(userManager)),
                     'x-correlation-id': correlationId,
                  }
               },
            }),
         ],
      })
   )

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
