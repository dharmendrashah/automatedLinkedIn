import { useQuery } from '@tanstack/react-query'

import { type SessionDetail } from './types'

import { trpc } from '../../trpc'
import { findArtifact } from './artifacts'

// A link lasts ten minutes; cache it for less, so a file opened again soon never uses a dead one.
const LINK_STALE_MS = 8 * 60 * 1000

type FileOwner = Pick<SessionDetail, 'id' | 'kind' | 'artifacts'>

type Link = {
   isPending: boolean
   error: { message: string } | null
   data: { url: string } | undefined
}

// The browser loads a recording straight from the bucket with a short-lived link from brain. A task run names a file by its id,
// an older session by its name; the caller always asks by name and this finds the right one.
export const useSessionLink = (session: FileOwner, file: string, { enabled = true, reveal = false } = {}): Link => {
   const isTask = session.kind === 'TASK'
   const artifact = findArtifact(session, file)
   const query = trpc.session.fileUrl.useQuery(
      isTask
         ? {
              id: session.id,
              artifactId: artifact?.id ?? 'none',
              reveal,
           }
         : {
              id: session.id,
              file,
           },
      {
         enabled: enabled && (!isTask || Boolean(artifact)),
         retry: false,
         staleTime: LINK_STALE_MS,
      }
   )

   if (isTask && !artifact) {
      return {
         isPending: false,
         error: { message: 'This file was not saved for this run.' },
         data: undefined,
      }
   }

   return {
      isPending: query.isPending,
      error: query.error,
      data: query.data,
   }
}

// A JSON or text file of the recording. Resolves to its text; the caller decides how to read it.
export const useSessionText = (session: FileOwner, file: string) => {
   const link = useSessionLink(session, file)
   const url = link.data?.url

   const text = useQuery({
      queryKey: ['session-file', session.id, file],
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
