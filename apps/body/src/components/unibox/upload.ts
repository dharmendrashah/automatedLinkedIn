// Sends one file of a reply to brain, which keeps it until the reply ends (.plan/unibox-send-attachments.md). Nothing is sent to LinkedIn here.
export type Upload = (uploadId: string, file: File) => Promise<{ ok: true } | { ok: false; reason: string }>

type Deps = {
   // Where brain is, and the signed-in person's token.
   apiUrl: string
   token: () => Promise<string | undefined>
   request?: typeof fetch
}

const FALLBACK = 'The file could not be sent. Try again.'

export const createUpload =
   ({ apiUrl, token, request = fetch }: Deps): Upload =>
   async (uploadId, file) => {
      const bearer = await token()

      if (!bearer) {
         return {
            ok: false,
            reason: 'Sign in again to send files.',
         }
      }

      try {
         const response = await request(`${apiUrl}/uploads/${uploadId}`, {
            method: 'POST',
            headers: {
               authorization: `Bearer ${bearer}`,
               'content-type': 'application/octet-stream',
               'x-file-name': encodeURIComponent(file.name),
            },
            body: file,
         })

         if (response.ok) {
            return { ok: true }
         }

         // Brain answers with a sentence for the person; anything else is not shown.
         const body: unknown = await response.json().catch(() => undefined)
         const error = (body as { error?: unknown } | undefined)?.error

         return {
            ok: false,
            reason: typeof error === 'string' && error.length <= 200 ? error : FALLBACK,
         }
      } catch {
         return {
            ok: false,
            reason: FALLBACK,
         }
      }
   }
