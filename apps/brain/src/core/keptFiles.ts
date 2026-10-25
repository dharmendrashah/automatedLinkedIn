import { Storage } from '@google-cloud/storage'

import { SPIDER_GCS_BUCKET } from 'env'

import { keptPrefix, sentKey } from '@automatedLinkedIn/contracts'

import { readLink } from './signedLink'

// The files of messages, kept for good in the spider bucket under kept/<user>/<account>/ (.plan/unibox-keep-messages-and-files.md).
// The only deletion is `removeAccount`, when the owner removes the account. Credentials come from Application Default Credentials.
export class KeptFiles {
   private static storage: Storage | undefined

   private static bucket() {
      if (SPIDER_GCS_BUCKET === '') {
         throw new Error('Files are not set up here.')
      }

      KeptFiles.storage ??= new Storage()

      return KeptFiles.storage.bucket(SPIDER_GCS_BUCKET)
   }

   // Moves the files of a finished reply from where they waited to their permanent place; resolves to how many.
   public static async moveUpload(userId: string, accountId: string, uploadId: string) {
      const bucket = KeptFiles.bucket()
      const prefix = `uploads/${userId}/${uploadId}/`
      const [files] = await bucket.getFiles({ prefix })

      for (const file of files) {
         await bucket.file(file.name).move(sentKey(userId, accountId, uploadId, file.name.slice(prefix.length)))
      }

      return files.length
   }

   // A link to read one file of the owner's own; anything else is refused before it is signed.
   public static async link(userId: string, key: string, name: string) {
      if (!key.startsWith(`kept/${userId}/`) || key.includes('..')) {
         throw new Error('Only your own files can be linked.')
      }

      return readLink(KeptFiles.bucket().file(key), name)
   }

   // Deletes every file of an account, which the owner removed. Where there is no bucket there is nothing to delete.
   public static async removeAccount(userId: string, accountId: string) {
      if (SPIDER_GCS_BUCKET === '') {
         return
      }

      await KeptFiles.bucket().deleteFiles({ prefix: keptPrefix(userId, accountId) })
   }
}
