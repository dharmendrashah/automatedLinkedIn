import { TRPCClientError } from '@trpc/client'

import { type SignedForm, sendSigned } from '../../lib/signed-upload'

type Deps = {
   form: (input: { fileId: string; name: string; bytes: number }) => Promise<SignedForm>
   confirm: (input: { fileId: string; name: string }) => Promise<{ key: string; name: string; bytes: number }>
   // Posts the form; only for tests.
   send?: typeof sendSigned
}

export type PostUploadResult = { ok: true; key: string; name: string } | { ok: false; reason: string }

const FALLBACK = 'The file could not be uploaded. Try again.'

// The sentence brain wrote for a file it refused (a type, a size, a check); anything else is not shown.
const reasonOf = (error: unknown) =>
   error instanceof TRPCClientError && error.data?.code === 'PRECONDITION_FAILED' ? error.message : FALLBACK

// Uploads one file of a draft: asks brain for a signed form, posts the file straight to the bucket, and asks brain to check and keep it
// (.plan/posting-file-uploads.md). Gives the key the draft stores. `cancelled` says the file was removed meanwhile: it is then not kept.
export const createPostUpload =
   ({ form, confirm, send = sendSigned }: Deps) =>
   async (
      fileId: string,
      file: File,
      onProgress: ((percent: number) => void) | undefined,
      cancelled: () => boolean
   ): Promise<PostUploadResult> => {
      try {
         const signed = await form({
            fileId,
            name: file.name,
            bytes: file.size,
         })
         const status = await send(signed, file, onProgress)

         if (status < 200 || status >= 300) {
            return {
               ok: false,
               reason: FALLBACK,
            }
         }

         if (cancelled()) {
            return {
               ok: false,
               reason: '',
            }
         }

         const kept = await confirm({
            fileId,
            name: signed.name,
         })

         return {
            ok: true,
            key: kept.key,
            name: kept.name,
         }
      } catch (error) {
         return {
            ok: false,
            reason: reasonOf(error),
         }
      }
   }
