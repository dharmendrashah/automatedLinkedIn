import { TRPCClientError } from '@trpc/client'

// Posts one file of a reply straight to the bucket with a form brain signed for it (.plan/unibox-presigned-uploads.md). Nothing is sent
// to LinkedIn here, and brain never holds the bytes; it looks at the file when the reply is sent.
export type Upload = (
   uploadId: string,
   file: File,
   onProgress?: (percent: number) => void
) => Promise<{ ok: true } | { ok: false; reason: string }>

export type SignedForm = {
   url: string
   fields: Record<string, string>
   name: string
}

type Deps = {
   // Asks brain for the signed form of one file.
   form: (input: { uploadId: string; name: string; bytes: number }) => Promise<SignedForm>
   // Posts the form and resolves to the status of the answer; only for tests.
   post?: (url: string, body: FormData, onProgress?: (percent: number) => void) => Promise<number>
}

const FALLBACK = 'The file could not be sent. Try again.'

const postForm = (url: string, body: FormData, onProgress?: (percent: number) => void) =>
   new Promise<number>((resolve, reject) => {
      const request = new XMLHttpRequest()

      request.open('POST', url)
      request.upload.onprogress = event => {
         if (event.lengthComputable) {
            onProgress?.(Math.round((event.loaded / event.total) * 100))
         }
      }
      request.onload = () => resolve(request.status)
      request.onerror = () => reject(new Error('The network failed.'))
      request.send(body)
   })

// The sentence brain wrote for a form it refused (a type, a size, too many files); anything else is not shown.
const refusalOf = (error: unknown) =>
   error instanceof TRPCClientError && error.data?.code === 'PRECONDITION_FAILED' ? error.message : FALLBACK

export const createUpload =
   ({ form, post = postForm }: Deps): Upload =>
   async (uploadId, file, onProgress) => {
      let signed: SignedForm

      try {
         signed = await form({
            uploadId,
            name: file.name,
            bytes: file.size,
         })
      } catch (error) {
         return {
            ok: false,
            reason: refusalOf(error),
         }
      }

      // The fields go first and the file last, as the bucket reads a form.
      const body = new FormData()

      for (const [name, value] of Object.entries(signed.fields)) {
         body.append(name, value)
      }

      body.append('file', file)

      try {
         const status = await post(signed.url, body, onProgress)

         return status >= 200 && status < 300
            ? { ok: true }
            : {
                 ok: false,
                 reason: FALLBACK,
              }
      } catch {
         return {
            ok: false,
            reason: FALLBACK,
         }
      }
   }
