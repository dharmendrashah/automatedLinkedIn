import { Storage } from '@google-cloud/storage'

import { SPIDER_GCS_BUCKET } from 'env'

// A link works for this long; the page asks for a new one when it needs a file again.
const LINK_TTL_MS = 10 * 60 * 1000

// Links for the browser to load a session's recording straight from the bucket, which stays private. Only paths
// under recordings/ (older sessions) or runs/ (every task run) are ever signed, and brain never reads the files itself. Credentials come from Application
// Default Credentials: Workload Identity on GKE, service account impersonation locally.
export class RecordingLinks {
   private static storage: Storage | undefined

   public static configured() {
      return SPIDER_GCS_BUCKET !== ''
   }

   public static async urlFor(key: string) {
      if (!RecordingLinks.configured()) {
         throw new Error('Recordings are not set up here.')
      }

      if (!(key.startsWith('recordings/') || key.startsWith('runs/')) || key.includes('..')) {
         throw new Error('Only files under recordings/ or runs/ can be linked.')
      }

      RecordingLinks.storage ??= new Storage()

      const [url] = await RecordingLinks.storage
         .bucket(SPIDER_GCS_BUCKET)
         .file(key)
         .getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: Date.now() + LINK_TTL_MS,
         })

      return url
   }
}
