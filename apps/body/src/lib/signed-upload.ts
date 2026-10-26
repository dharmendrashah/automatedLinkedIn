// Posting a file straight to the bucket with a form brain signed for it: the fields first and the file last, as the bucket reads a form.
// Used by the Unibox (files of a reply) and by the post canvas (files of a draft). Brain never holds the bytes.
export type SignedForm = {
   url: string
   fields: Record<string, string>
   name: string
}

type Post = (url: string, body: FormData, onProgress?: (percent: number) => void) => Promise<number>

export const postForm: Post = (url, body, onProgress) =>
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

// Resolves to the status the bucket answered with; a good one is in the 200s.
export const sendSigned = (signed: SignedForm, file: File, onProgress?: (percent: number) => void, post: Post = postForm) => {
   const body = new FormData()

   for (const [name, value] of Object.entries(signed.fields)) {
      body.append(name, value)
   }

   body.append('file', file)

   return post(signed.url, body, onProgress)
}
