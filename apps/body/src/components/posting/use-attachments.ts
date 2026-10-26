import { useCallback, useEffect, useRef, useState } from 'react'

export type Attached = {
   file: File
   url: string
}

// The files the owner picked for this post, by the id of the photo or video they belong to. They stay in memory only: nothing is
// uploaded, and a draft that is opened again has to be given its files again. Each file has an address for the preview, which is
// released when the file is dropped and when the page is left.
export const useAttachments = () => {
   const [files, setFiles] = useState<ReadonlyMap<string, Attached>>(new Map())
   const latest = useRef(files)

   useEffect(() => {
      latest.current = files
   }, [files])

   useEffect(
      () => () => {
         for (const { url } of latest.current.values()) {
            URL.revokeObjectURL(url)
         }
      },
      []
   )

   const detach = useCallback((id: string) => {
      const found = latest.current.get(id)

      if (found) {
         URL.revokeObjectURL(found.url)
         setFiles(current => {
            const next = new Map(current)

            next.delete(id)

            return next
         })
      }
   }, [])

   const attach = useCallback(
      (id: string, file: File) => {
         const attached = {
            file,
            url: URL.createObjectURL(file),
         }

         detach(id)
         setFiles(current => new Map(current).set(id, attached))
      },
      [detach]
   )

   return {
      files,
      attach,
      detach,
   }
}
