import { Storage } from '@google-cloud/storage'

import { SPIDER_GCS_BUCKET } from 'env'

import { MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, extensionOf } from '@automatedLinkedIn/contracts'

import { HEAD_BYTES, looksLike } from './uploadSniff'

// What waits under uploads/ for one user at most: files uploaded and not yet sent (a sent reply's files move to kept/, see KeptFiles),
// so a stream of uploads that are never sent cannot fill the bucket. A one day bucket rule removes what was never sent.
const MAX_STORED_PER_USER = 10 * MAX_ATTACHMENT_BYTES

// A signed form works for this long; the page posts the file at once.
const FORM_TTL_MS = 10 * 60 * 1000
// The type every upload is stored with, so the bucket never serves one as a page or a script.
const NEUTRAL_TYPE = 'application/octet-stream'

export type StoredFile = {
   name: string
   bytes: number
}

// A signed form for one file: where to post it and what to post with it.
export type UploadForm = {
   url: string
   fields: Record<string, string>
   name: string
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

// The files of replies, in the spider bucket under uploads/<user>/<upload>/ from the moment the page posts them until the reply ends, when
// they move to kept/. The page posts a file straight to the bucket with a signed form (`form`); brain never holds the bytes, and looks at
// the file only when the reply is sent (`verify`). Credentials come from Application Default Credentials, like MessageFiles.
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

   // A signed form to post one file, for exactly one object of this user and upload: from 1 byte to the most a reply may carry, with
   // a neutral type. The name is made unique in the upload. The limits are enforced by the bucket when the form is posted.
   public static async form(userId: string, uploadId: string, wanted: string, bytes: number): Promise<UploadForm> {
      if (bytes < 1) {
         throw new UploadRefused(400, 'The file is empty.')
      }

      if (bytes > MAX_ATTACHMENT_BYTES) {
         throw new UploadRefused(413, 'The file is larger than a reply may carry.')
      }

      const [existing, used] = await Promise.all([UploadFiles.list(userId, uploadId), UploadFiles.used(userId)])

      if (existing.length >= MAX_ATTACHMENTS) {
         throw new UploadRefused(409, `A reply can carry up to ${MAX_ATTACHMENTS} files.`)
      }

      if (used >= MAX_STORED_PER_USER) {
         throw new UploadRefused(429, 'Too many files are waiting to be sent. Try again in a moment.')
      }

      const name = freeName(wanted, new Set(existing.map(file => file.name)))
      const [form] = await UploadFiles.bucket()
         .file(`${prefixOf(userId, uploadId)}${name}`)
         .generateSignedPostPolicyV4({
            expires: Date.now() + FORM_TTL_MS,
            fields: { 'Content-Type': NEUTRAL_TYPE },
            conditions: [
               ['content-length-range', 1, MAX_ATTACHMENT_BYTES],
               ['eq', '$Content-Type', NEUTRAL_TYPE],
            ],
         })

      return {
         url: form.url,
         fields: form.fields,
         name,
      }
   }

   // The files of an upload as the bucket holds them, once each is checked: its size and its first bytes must be what its name says.
   // A file that is not is deleted and refused with a sentence, so what the spider is told is always checked.
   public static async verify(userId: string, uploadId: string): Promise<StoredFile[]> {
      const prefix = prefixOf(userId, uploadId)
      const [files] = await UploadFiles.bucket().getFiles({ prefix })
      const checked: StoredFile[] = []

      for (const file of files) {
         const name = file.name.slice(prefix.length)
         const bytes = Number(file.metadata.size ?? 0)
         const refuse = async (status: number, message: string) => {
            await file.delete({ ignoreNotFound: true })

            return new UploadRefused(status, message)
         }

         if (bytes < 1) {
            throw await refuse(400, 'A file is empty.')
         }

         if (bytes > MAX_ATTACHMENT_BYTES) {
            throw await refuse(413, 'A file is larger than a reply may carry.')
         }

         const [head] = await file.download({
            start: 0,
            end: HEAD_BYTES - 1,
         })

         if (!looksLike(name, head)) {
            throw await refuse(415, 'A file is not what its name says it is.')
         }

         checked.push({
            name,
            bytes,
         })
      }

      return checked
   }

   private static async used(userId: string) {
      const [files] = await UploadFiles.bucket().getFiles({ prefix: prefixOf(userId) })

      return files.reduce((sum, file) => sum + Number(file.metadata.size ?? 0), 0)
   }
}
