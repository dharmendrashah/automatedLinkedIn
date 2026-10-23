import { Storage } from '@google-cloud/storage'
import { once } from 'node:events'

import { SPIDER_GCS_BUCKET } from 'env'

import { MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, extensionOf } from '@automatedLinkedIn/contracts'

import { HEAD_BYTES, looksLike } from './uploadSniff'

// What waits under uploads/ for one user at most: files uploaded and not yet sent (a sent reply's files move to kept/, see KeptFiles),
// so a stream of uploads that are never sent cannot fill the bucket. A one day bucket rule removes what was never sent.
const MAX_STORED_PER_USER = 10 * MAX_ATTACHMENT_BYTES

export type StoredFile = {
   name: string
   bytes: number
}

// An upload brain will not take, with the status and the sentence for the person who sent it.
export class UploadRefused extends Error {
   public readonly status: number

   public constructor(status: number, message: string) {
      super(message)
      this.name = 'UploadRefused'
      this.status = status
   }
}

const prefixOf = (userId: string, uploadId?: string) => `uploads/${userId}/${uploadId ? `${uploadId}/` : ''}`

// A name that is not taken yet in the upload: "cv.pdf", then "cv (2).pdf", "cv (3).pdf".
const freeName = (wanted: string, taken: Set<string>) => {
   if (!taken.has(wanted)) {
      return wanted
   }

   const extension = extensionOf(wanted)
   const stem = extension === undefined ? wanted : wanted.slice(0, -(extension.length + 1))
   const dot = extension === undefined ? '' : `.${extension}`

   for (let copy = 2; ; copy += 1) {
      const name = `${stem} (${copy})${dot}`

      if (!taken.has(name)) {
         return name
      }
   }
}

// The files of replies, kept in the spider bucket under uploads/<user>/<upload>/ from the moment the person sends them until the reply
// ends, when they move to kept/. Brain writes here and the spider reads only here; credentials come from Application Default Credentials, like MessageFiles.
export class UploadFiles {
   private static storage: Storage | undefined

   private static bucket() {
      if (SPIDER_GCS_BUCKET === '') {
         throw new UploadRefused(503, 'Files cannot be sent from here.')
      }

      UploadFiles.storage ??= new Storage()

      return UploadFiles.storage.bucket(SPIDER_GCS_BUCKET)
   }

   public static async list(userId: string, uploadId: string): Promise<StoredFile[]> {
      const prefix = prefixOf(userId, uploadId)
      const [files] = await UploadFiles.bucket().getFiles({ prefix })

      return files.map(file => ({
         name: file.name.slice(prefix.length),
         bytes: Number(file.metadata.size ?? 0),
      }))
   }

   // Takes one file from a request body, only while it is no larger than a reply may carry and starts like its type says; what it
   // refuses is not left in the bucket.
   public static async save(
      userId: string,
      uploadId: string,
      wanted: string,
      body: AsyncIterable<unknown>
   ): Promise<StoredFile> {
      const [existing, used] = await Promise.all([UploadFiles.list(userId, uploadId), UploadFiles.used(userId)])

      if (existing.length >= MAX_ATTACHMENTS) {
         throw new UploadRefused(409, `A reply can carry up to ${MAX_ATTACHMENTS} files.`)
      }

      if (used >= MAX_STORED_PER_USER) {
         throw new UploadRefused(429, 'Too many files are waiting to be sent. Try again in a moment.')
      }

      const name = freeName(wanted, new Set(existing.map(file => file.name)))
      const file = UploadFiles.bucket().file(`${prefixOf(userId, uploadId)}${name}`)
      const out = file.createWriteStream({
         contentType: 'application/octet-stream',
         resumable: false,
      })
      const write = async (chunk: Buffer) => {
         if (!out.write(chunk)) {
            await once(out, 'drain')
         }
      }
      let size = 0
      let verified = false
      let pending: Buffer[] = []

      // The first bytes are held back until there are enough to tell the type; nothing is written before they pass.
      const verify = async () => {
         if (!looksLike(wanted, Buffer.concat(pending).subarray(0, HEAD_BYTES))) {
            throw new UploadRefused(415, 'The file is not what its name says it is.')
         }

         verified = true

         for (const chunk of pending) {
            await write(chunk)
         }

         pending = []
      }

      try {
         for await (const part of body) {
            if (!Buffer.isBuffer(part)) {
               throw new UploadRefused(400, 'The file could not be read.')
            }

            size += part.length

            if (size > MAX_ATTACHMENT_BYTES) {
               throw new UploadRefused(413, 'The file is larger than a reply may carry.')
            }

            if (verified) {
               await write(part)
            } else {
               pending.push(part)

               if (Buffer.concat(pending).length >= HEAD_BYTES) {
                  await verify()
               }
            }
         }

         if (size === 0) {
            throw new UploadRefused(400, 'The file is empty.')
         }

         if (!verified) {
            await verify()
         }

         out.end()
         await once(out, 'finish')
      } catch (error) {
         out.destroy()
         await file.delete({ ignoreNotFound: true }).catch(() => undefined)

         throw error
      }

      return {
         name,
         bytes: size,
      }
   }

   private static async used(userId: string) {
      const [files] = await UploadFiles.bucket().getFiles({ prefix: prefixOf(userId) })

      return files.reduce((sum, file) => sum + Number(file.metadata.size ?? 0), 0)
   }
}
