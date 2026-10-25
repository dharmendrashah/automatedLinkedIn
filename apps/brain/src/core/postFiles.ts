import { Storage } from '@google-cloud/storage'

import { SPIDER_GCS_BUCKET } from 'env'

import {
   POST_FILES,
   type PostFileKind,
   extensionOf,
   postKey,
   postUploadKey,
   safeFileName,
} from '@automatedLinkedIn/contracts'

import { readLink } from './signedLink'
import { UploadRefused } from './uploadFiles'
import { HEAD_BYTES, looksLike } from './uploadSniff'

// What one owner may hold in the bucket for drafts, both folders together, so a stream of uploads cannot fill it.
const MAX_STORED_PER_USER = 2 * 1024 * 1024 * 1024

// A signed form works for this long; the page posts the file at once.
const FORM_TTL_MS = 10 * 60 * 1000
// The type every upload is stored with, so the bucket never serves one as a page or a script.
const NEUTRAL_TYPE = 'application/octet-stream'

const kindOf = (name: string): PostFileKind | undefined => {
   const extension = extensionOf(name) ?? ''

   return (Object.keys(POST_FILES) as PostFileKind[]).find(kind => POST_FILES[kind].types.includes(extension))
}

const sizeSentence = (max: number) => `The file is larger than ${Math.round(max / (1024 * 1024))} MB.`

// A signed form for one file: where to post it, what to post with it, and the name and kind brain settled on.
export type PostUploadForm = {
   url: string
   fields: Record<string, string>
   name: string
   kind: PostFileKind
}

// The files of the posts the owner is writing (.plan/posting-file-uploads.md). The page posts a file straight to the bucket with a form
// brain signed (`form`) into `post-uploads/<user>/<file>/`, where a one day rule removes what is never confirmed; `confirm` looks at it
// (size and first bytes) and moves it to `posts/<user>/<file>/`, and the draft keeps that key. Credentials come from Application
// Default Credentials, like UploadFiles.
export class PostFiles {
   private static storage: Storage | undefined

   private static bucket() {
      if (SPIDER_GCS_BUCKET === '') {
         throw new UploadRefused(503, 'Files cannot be stored from here.')
      }

      PostFiles.storage ??= new Storage()

      return PostFiles.storage.bucket(SPIDER_GCS_BUCKET)
   }

   public static async form(userId: string, fileId: string, wanted: string, bytes: number): Promise<PostUploadForm> {
      const name = safeFileName(wanted)
      const kind = kindOf(name)

      if (!kind) {
         throw new UploadRefused(415, 'LinkedIn does not take this type of file in a post.')
      }

      const { max } = POST_FILES[kind]

      if (bytes < 1) {
         throw new UploadRefused(400, 'The file is empty.')
      }

      if (bytes > max) {
         throw new UploadRefused(413, sizeSentence(max))
      }

      if ((await PostFiles.used(userId)) >= MAX_STORED_PER_USER) {
         throw new UploadRefused(429, 'You hold too many files for drafts. Delete some drafts first.')
      }

      const [form] = await PostFiles.bucket()
         .file(postUploadKey(userId, fileId, name))
         .generateSignedPostPolicyV4({
            expires: Date.now() + FORM_TTL_MS,
            fields: { 'Content-Type': NEUTRAL_TYPE },
            conditions: [
               ['content-length-range', 1, max],
               ['eq', '$Content-Type', NEUTRAL_TYPE],
            ],
         })

      return {
         url: form.url,
         fields: form.fields,
         name,
         kind,
      }
   }

   // Checks the file the page posted and keeps it. Asked twice, it answers the same key. A file that is not what its name says is deleted.
   public static async confirm(userId: string, fileId: string, wanted: string) {
      const name = safeFileName(wanted)
      const kind = kindOf(name)

      if (!kind) {
         throw new UploadRefused(415, 'LinkedIn does not take this type of file in a post.')
      }

      const bucket = PostFiles.bucket()
      const waiting = bucket.file(postUploadKey(userId, fileId, name))
      const kept = bucket.file(postKey(userId, fileId, name))
      const key = postKey(userId, fileId, name)

      if (!(await waiting.exists())[0]) {
         if ((await kept.exists())[0]) {
            const [metadata] = await kept.getMetadata()

            return {
               key,
               name,
               bytes: Number(metadata.size ?? 0),
            }
         }

         throw new UploadRefused(404, 'The file was not found. Attach it again.')
      }

      const [metadata] = await waiting.getMetadata()
      const bytes = Number(metadata.size ?? 0)
      const refuse = async (status: number, message: string) => {
         await waiting.delete()

         return new UploadRefused(status, message)
      }

      if (bytes < 1) {
         throw await refuse(400, 'The file is empty.')
      }

      if (bytes > POST_FILES[kind].max) {
         throw await refuse(413, sizeSentence(POST_FILES[kind].max))
      }

      const [head] = await waiting.download({
         start: 0,
         end: HEAD_BYTES - 1,
      })

      if (!looksLike(name, head)) {
         throw await refuse(415, 'The file is not what its name says it is.')
      }

      await waiting.move(kept)

      return {
         key,
         name,
         bytes,
      }
   }

   // A link to read one file of the owner's own draft; anything else is refused before it is signed.
   public static async link(userId: string, key: string, name: string) {
      if (!key.startsWith(`posts/${userId}/`) || key.includes('..')) {
         throw new UploadRefused(403, 'Only your own files can be linked.')
      }

      return readLink(PostFiles.bucket().file(key), name)
   }

   // Deletes files of drafts that were changed or deleted; resolves to how many could not be deleted. Where there is no bucket there is
   // nothing to delete.
   public static async remove(keys: string[]) {
      if (keys.length === 0 || SPIDER_GCS_BUCKET === '') {
         return 0
      }

      const bucket = PostFiles.bucket()
      const results = await Promise.allSettled(keys.map(key => bucket.file(key).delete({ ignoreNotFound: true })))

      return results.filter(({ status }) => status === 'rejected').length
   }

   private static async used(userId: string) {
      const bucket = PostFiles.bucket()
      const folders = await Promise.all(
         [`posts/${userId}/`, `post-uploads/${userId}/`].map(prefix => bucket.getFiles({ prefix }))
      )

      return folders.flatMap(([files]) => files).reduce((sum, file) => sum + Number(file.metadata.size ?? 0), 0)
   }
}
