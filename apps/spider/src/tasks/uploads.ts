import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, UPLOAD_ID, safeFileName } from '@automatedLinkedIn/contracts'

export type Download = (key: string, localPath: string) => Promise<void>

export type Fetched = {
   // The files on this machine, in the order asked for.
   paths: string[]
   // Deletes them; always call it, whatever happened.
   remove: () => Promise<void>
}

// The files of a reply, from where brain keeps them (`uploads/<user>/<upload>/<name>`) into a folder of their own. The user comes from the
// command of the run, never from the input, and each name must already be a safe name, so a command cannot reach another user's files or a
// path outside its own upload. A file over the limit is refused after it was downloaded, whatever brain checked.
export const fetchUploads = async (
   download: Download,
   userId: string,
   uploadId: string,
   names: string[]
): Promise<Fetched> => {
   if (!UPLOAD_ID.test(uploadId)) {
      throw new Error('The upload is not valid.')
   }

   if (names.length === 0 || names.length > MAX_ATTACHMENTS || new Set(names).size !== names.length) {
      throw new Error('The list of files is not valid.')
   }

   if (names.some(name => name === '' || safeFileName(name) !== name)) {
      throw new Error('A file name is not valid.')
   }

   const folder = await mkdtemp(join(tmpdir(), 'spider-upload-'))
   const remove = () =>
      rm(folder, {
         recursive: true,
         force: true,
      })

   try {
      const paths: string[] = []

      for (const name of names) {
         const path = join(folder, name)

         await download(`uploads/${userId}/${uploadId}/${name}`, path)

         if ((await stat(path)).size > MAX_ATTACHMENT_BYTES) {
            throw new Error('A file is larger than a reply may carry.')
         }

         paths.push(path)
      }

      return {
         paths,
         remove,
      }
   } catch (error) {
      await remove()

      throw error
   }
}
