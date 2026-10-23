import { Storage } from '@google-cloud/storage'
import { type Readable, type Writable } from 'node:stream'

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

   // A file of a message, as bytes, and whether one is already there.
   public async putBytes(key: string, body: Buffer, contentType: string) {
      await this.bucket.file(key).save(body, {
         contentType,
         resumable: false,
      })
   }

   public async exists(key: string) {
      const [found] = await this.bucket.file(key).exists()

      return found
   }

   // For an object too large to hold in memory, such as a browser profile. A missing object fails the stream with code 404.
   public readStream(key: string): Readable {
      return this.bucket.file(key).createReadStream()
   }

   // The object is replaced only when the stream ends without an error, so a cut-off upload keeps the old one.
   public writeStream(key: string, contentType: string): Writable {
      return this.bucket.file(key).createWriteStream({
         contentType,
         resumable: true,
      })
   }

   public async upload(key: string, localPath: string, contentType: string) {
      await this.bucket.upload(localPath, {
         destination: key,
         contentType,
         resumable: false,
      })
   }

   // A stored file to a path on this machine, without holding it in memory.
   public async download(key: string, localPath: string) {
      await this.bucket.file(key).download({ destination: localPath })
   }

   // A read that needs nothing but the permission the worker already has, for the health check.
   public async ping() {
      await this.bucket.getFiles({
         prefix: 'sessions/',
         maxResults: 1,
         autoPaginate: false,
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

   // `ifGenerationMatch` makes GCS refuse the write (412) once someone else changed or removed the object.
   public async replace(key: string, body: string, contentType: string, version: string) {
      const file = this.bucket.file(key)

      try {
         await file.save(body, {
            contentType,
            resumable: false,
            preconditionOpts: { ifGenerationMatch: Number(version) },
         })
      } catch (error) {
         if (statusOf(error) === 412 || statusOf(error) === 404) {
            return undefined
         }

         throw error
      }

      return String(file.metadata.generation)
   }
}
