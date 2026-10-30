import { useEffect, useRef } from 'react'

import { trpc } from '../../trpc'

// Tells brain the owner left this client's people (the page closed or another client was picked), so the next visit counts what
// is new since now. The check runs a tick later so React's development remount does not count as leaving.
export const useSeenOnLeave = (clientId: string) => {
   const { client } = trpc.useUtils()
   const mounted = useRef(false)

   useEffect(() => {
      const flag = mounted

      flag.current = true

      return () => {
         flag.current = false
         window.setTimeout(() => {
            if (!flag.current) {
               client.people.seen.mutate({ clientId }).catch(() => undefined)
            }
         }, 0)
      }
   }, [client, clientId])
}
