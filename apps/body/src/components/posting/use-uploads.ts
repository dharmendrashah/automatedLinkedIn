import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { trpc } from '../../trpc'
import { createPostUpload } from './post-upload'

export type UploadState = { status: 'uploading'; percent: number } | { status: 'failed'; reason: string }

type Uploaded = {
   key: string
   name: string
}

const without = (states: Record<string, UploadState>, fileId: string) => {
   const next = { ...states }

   delete next[fileId]

   return next
}

// Uploads the files of the draft as they are picked, and says where each one is: uploading with a percent, or failed with a sentence.
// `onUploaded` is told the key of each file that was uploaded and checked, so the draft can keep it.
export const useUploads = (onUploaded: (fileId: string, uploaded: Uploaded) => void) => {
   const utils = trpc.useUtils()
   const [states, setStates] = useState<Record<string, UploadState>>({})
   const removed = useRef(new Set<string>())
   const told = useRef(onUploaded)
   const upload = useMemo(
      () =>
         createPostUpload({
            form: input => utils.client.postFile.form.mutate(input),
            confirm: input => utils.client.postFile.confirm.mutate(input),
         }),
      [utils]
   )

   useEffect(() => {
      told.current = onUploaded
   })

   const start = useCallback(
      async (fileId: string, file: File) => {
         removed.current.delete(fileId)
         setStates(current => ({ ...current, [fileId]: { status: 'uploading', percent: 0 } }))

         const result = await upload(
            fileId,
            file,
            percent =>
               setStates(current =>
                  removed.current.has(fileId) ? current : { ...current, [fileId]: { status: 'uploading', percent } }
               ),
            () => removed.current.has(fileId)
         )

         if (removed.current.has(fileId)) {
            return
         }

         if (result.ok) {
            setStates(current => without(current, fileId))
            told.current(fileId, {
               key: result.key,
               name: result.name,
            })
         } else {
            setStates(current => ({ ...current, [fileId]: { status: 'failed', reason: result.reason } }))
         }
      },
      [upload]
   )

   // The file was taken out of the post: its result, when it comes, is ignored.
   const forget = useCallback((fileId: string) => {
      removed.current.add(fileId)
      setStates(current => without(current, fileId))
   }, [])

   return {
      states,
      start,
      forget,
   }
}
