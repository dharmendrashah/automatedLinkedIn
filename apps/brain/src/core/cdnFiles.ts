import { Storage } from '@google-cloud/storage'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { CDN_GCS_BUCKET } from 'env'

import { CdnFetchError, openRemote } from './cdnFetch'
import { bodyTimeoutMs, bucketUrlOf, mediaType, objectKey, servedAs, sizeCap } from './cdnUrl'

// A key holds one file for good, so browsers and Google's edge may keep it a year.
const OBJECT_CACHE_CONTROL = 'public, max-age=31536000, immutable'

export type StoredCdnFile = {
   bucketUrl: string
   contentType: string
   size: number
}

// Copies public remote files into the public cdn bucket (.plan/cdn-public-endpoint.md). Credentials come from Application Default
// Credentials; only create is needed, nothing is signed.
export class CdnFiles {
   private static storage: Storage | undefined

   public static isSetUp() {
      return CDN_GCS_BUCKET !== ''
   }

   // Whether brain can read the cache bucket with its own rights (one object listed under cache/).
   public static async reachable() {
      CdnFiles.storage ??= new Storage()

      await CdnFiles.storage.bucket(CDN_GCS_BUCKET).getFiles({
         prefix: 'cache/',
         maxResults: 1,
      })

      return true
   }

   // Streams the remote file into the bucket, at `bucketUrl` when the file had a key before, so its address never changes.
   public static async store(
      url: URL,
      hash: string,
      bucketUrl: string | null,
      open = openRemote
   ): Promise<StoredCdnFile> {
      const remote = await open(url)
      const type = mediaType(remote.response.headers['content-type'])
      const cap = sizeCap(type)

      if (Number(remote.response.headers['content-length'] ?? 0) > cap) {
         remote.abort()

         throw new CdnFetchError('TOO_BIG')
      }

      remote.deadline(bodyTimeoutMs(type))

      const target = bucketUrl ?? bucketUrlOf(CDN_GCS_BUCKET, objectKey(url, type, hash))
      const [, bucket = '', key = ''] = /^gs:\/\/([^/]+)\/(.+)$/.exec(target) ?? []
      const served = servedAs(type)
      let size = 0
      const counter = new Transform({
         transform(chunk: Buffer, _encoding, done) {
            size += chunk.length
            done(size > cap ? new CdnFetchError('TOO_BIG') : null, chunk)
         },
      })

      CdnFiles.storage ??= new Storage()

      try {
         await pipeline(
            remote.response,
            counter,
            CdnFiles.storage
               .bucket(bucket)
               .file(key)
               .createWriteStream({
                  resumable: false,
                  contentType: served.contentType,
                  metadata: {
                     cacheControl: OBJECT_CACHE_CONTROL,
                     contentDisposition: served.contentDisposition,
                  },
               })
         )
      } catch (error) {
         remote.abort()

         throw error instanceof Error && error.name === 'AbortError' ? new CdnFetchError('TIMEOUT') : error
      }

      remote.finish()

      return {
         bucketUrl: target,
         contentType: type || 'application/octet-stream',
         size,
      }
   }
}
