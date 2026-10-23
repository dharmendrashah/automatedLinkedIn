import { Storage } from '@google-cloud/storage'

import { SPIDER_GCS_BUCKET } from 'env'

// A run keeps at most 1 MB per file (the reader stops at 900,000 characters before redaction); this leaves room.
const MAX_BYTES = 2 * 1024 * 1024

// Reads one file of a task run from the bucket, for the importer of messages. Brain reads nothing else from the bucket: only
// paths under runs/ are taken (the importer only passes paths it checked against the run's own folder), and a file over the
// limit is refused before it is downloaded. Credentials come from Application Default Credentials, like the signed links.
export class MessageFiles {
   private static storage: Storage | undefined

   public static async read(path: string) {
      if (SPIDER_GCS_BUCKET === '') {
         throw new Error('Cloud storage is not set up here.')
      }

      if (!path.startsWith('runs/') || path.includes('..')) {
         throw new Error('Only files under runs/ can be read.')
      }

      MessageFiles.storage ??= new Storage()

      const file = MessageFiles.storage.bucket(SPIDER_GCS_BUCKET).file(path)
      const [metadata] = await file.getMetadata()

      if (Number(metadata.size) > MAX_BYTES) {
         throw new Error('The file is too large to read.')
      }

      const [content] = await file.download()

      return content.toString('utf8')
   }
}
