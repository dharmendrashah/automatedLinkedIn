import { useQuery } from '@tanstack/react-query'

import { trpc } from '../../trpc'

// A link lasts ten minutes; cache it for less, so a file opened again soon never uses a dead one.
const LINK_STALE_MS = 8 * 60 * 1000

// The browser loads a recording straight from the bucket with a short-lived link from brain.
export const useSessionLink = (sessionId: string, file: string, enabled = true) =>
   trpc.session.fileUrl.useQuery(
      {
         id: sessionId,
         file,
      },
      {
         enabled,
         retry: false,
         staleTime: LINK_STALE_MS,
      }
   )

// A JSON or text file of the recording. Resolves to its text; the caller decides how to read it.
export const useSessionText = (sessionId: string, file: string) => {
   const link = useSessionLink(sessionId, file)
   const url = link.data?.url

   const text = useQuery({
      queryKey: ['session-file', sessionId, file],
      enabled: Boolean(url),
      retry: false,
      // A finished recording never changes.
      staleTime: Infinity,
      queryFn: async () => {
         const response = await fetch(url as string)

         if (!response.ok) {
            throw new Error(`The file could not be loaded (${response.status}).`)
         }

         return response.text()
      },
   })

   return {
      text: text.data,
      loading: link.isPending || (Boolean(url) && text.isPending),
      error: link.error?.message ?? (text.error ? 'The file could not be loaded. Try again in a moment.' : undefined),
   }
}
