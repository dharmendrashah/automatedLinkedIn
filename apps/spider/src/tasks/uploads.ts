import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
   MAX_ATTACHMENTS,
   MAX_ATTACHMENT_BYTES,
   POST_FILES_TOTAL_BYTES,
   POST_FILE_ID,
   UPLOAD_ID,
   postKey,
   safeFileName,
} from '@automatedLinkedIn/contracts'

export type Download = (key: string, localPath: string) => Promise<void>

export type Fetched = {
   // The files on this machine, in the order asked for.
   paths: string[]
   // Deletes them; always call it, whatever happened.
   remove: () => Promise<void>
}

type Limits = {
   // A file larger than this, or all of them larger than `total`, is refused after it was downloaded, whatever brain checked.
   file: number
   total: number
   tooLarge: string
}

// Downloads each key into one folder of its own, in order. What was fetched is removed when anything goes wrong.
const fetchAll = async (download: Download, items: Array<{ key: string; name: string }>, limits: Limits) => {
   const folder = await mkdtemp(join(tmpdir(), 'spider-upload-'))
   const remove = () =>
      rm(folder, {
         recursive: true,
         force: true,
      })

   try {
      const paths: string[] = []
      let bytes = 0

      for (const { key, name } of items) {
         const path = join(folder, name)

         await download(key, path)

         const { size } = await stat(path)

         bytes += size

         if (size > limits.file || bytes > limits.total) {
            throw new Error(limits.tooLarge)
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

   return fetchAll(
      download,
      names.map(name => ({
         key: `uploads/${userId}/${uploadId}/${name}`,
         name,
      })),
      {
         file: MAX_ATTACHMENT_BYTES,
         total: Number.POSITIVE_INFINITY,
         tooLarge: 'A file is larger than a reply may carry.',
      }
   )
}

// The files of a post, from where brain keeps them (`posts/<user>/<file id>/<name>`), under the same rules as a reply's: the user is the
// run's, each id and name must be valid, and the files are checked again once downloaded, all of them together as well.
export const fetchPostFiles = async (
   download: Download,
   userId: string,
   files: Array<{ id: string; name: string }>
): Promise<Fetched> => {
   if (
      files.length === 0 ||
      files.length > MAX_ATTACHMENTS ||
      new Set(files.map(({ id }) => id)).size !== files.length
   ) {
      throw new Error('The list of files is not valid.')
   }

   if (files.some(({ id }) => !POST_FILE_ID.test(id))) {
      throw new Error('A file id is not valid.')
   }

   if (files.some(({ name }) => name === '' || safeFileName(name) !== name)) {
      throw new Error('A file name is not valid.')
   }

   return fetchAll(
      download,
      files.map(({ id, name }) => ({
         key: postKey(userId, id, name),
         name,
      })),
      {
         file: POST_FILES_TOTAL_BYTES,
         total: POST_FILES_TOTAL_BYTES,
         tooLarge: 'The files are larger than a post may carry.',
      }
   )
}
