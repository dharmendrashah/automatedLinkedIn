import { Storage } from '@google-cloud/storage'

import { ObjectNotFoundError, type ObjectStore } from './store'

const statusOf = (error: unknown) => (error as { code?: number } | null)?.code

// Credentials come from Application Default Credentials: a mounted key file locally, Workload Identity on GKE.
export class GcsStore implements ObjectStore {
   private readonly bucket

   public constructor(bucketName: string, storage: Storage = new Storage()) {
      if (!bucketName) {
         throw new Error('SPIDER_GCS_BUCKET is not set')
      }

      this.bucket = storage.bucket(bucketName)
   }

   public async put(key: string, body: string, contentType: string) {
      await this.bucket.file(key).save(body, {
         contentType,
         resumable: false,
      })
   }

   public async get(key: string) {
      try {
         const [data] = await this.bucket.file(key).download()

         return data.toString('utf8')
      } catch (error) {
         if (statusOf(error) === 404) {
            throw new ObjectNotFoundError(key)
         }

         throw error
      }
   }

   // `ifGenerationMatch: 0` makes GCS refuse the write (412) when the object exists.
   public async create(key: string, body: string, contentType: string) {
      const file = this.bucket.file(key)

      try {
         await file.save(body, {
            contentType,
            resumable: false,
            preconditionOpts: { ifGenerationMatch: 0 },
         })
      } catch (error) {
         if (statusOf(error) === 412) {
            return undefined
         }

         throw error
      }

      return String(file.metadata.generation)
   }

   // Reads the body of the exact generation it reports, so the two cannot come from different writes.
   public async getVersioned(key: string) {
      try {
         const [{ generation }] = await this.bucket.file(key).getMetadata()
         const version = String(generation)
         const [data] = await this.bucket.file(key, { generation: version }).download()

         return {
            body: data.toString('utf8'),
            version,
         }
      } catch (error) {
         if (statusOf(error) === 404) {
            throw new ObjectNotFoundError(key)
         }

         throw error
      }
   }

   public async delete(key: string, version: string) {
      try {
         await this.bucket.file(key).delete({ ifGenerationMatch: Number(version) })
      } catch (error) {
         // Already gone, or replaced by someone else: nothing of ours is left to delete.
         if (statusOf(error) !== 404 && statusOf(error) !== 412) {
            throw error
         }
      }
   }
}
