import { TRPCClientError } from '@trpc/client'
import { describe, expect, it, vi } from 'vitest'

import { createUpload } from './upload'

const UPLOAD = '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34'
const file = new File(['content'], 'My CV.pdf', { type: 'application/pdf' })
const signed = {
   url: 'https://storage.googleapis.com/bucket/',
   fields: {
      key: 'uploads/u/x/My CV.pdf',
      'Content-Type': 'application/octet-stream',
      policy: 'p',
   },
   name: 'My CV.pdf',
}

describe('createUpload', () => {
   it('should ask brain for a form with the name and size, then post the fields and then the file to the bucket', async () => {
      const form = vi.fn(async () => signed)
      const post = vi.fn(async (_url: string, _body: FormData) => 204)

      await expect(createUpload({ form, post })(UPLOAD, file)).resolves.toEqual({ ok: true })

      expect(form).toHaveBeenCalledWith({
         uploadId: UPLOAD,
         name: 'My CV.pdf',
         bytes: 7,
      })

      const [url, body] = post.mock.calls[0] as unknown as [string, FormData]

      expect(url).toBe('https://storage.googleapis.com/bucket/')
      // The file is the last part, after every field the form was signed with.
      expect([...body.keys()]).toEqual(['key', 'Content-Type', 'policy', 'file'])
      expect(body.get('key')).toBe('uploads/u/x/My CV.pdf')
      expect(body.get('file')).toBeInstanceOf(File)
   })

   it('should pass the progress of the post on', async () => {
      const seen: number[] = []
      const post = vi.fn(async (_url: string, _body: FormData, onProgress?: (percent: number) => void) => {
         onProgress?.(40)
         onProgress?.(100)

         return 204
      })

      await createUpload({ form: async () => signed, post })(UPLOAD, file, percent => seen.push(percent))

      expect(seen).toEqual([40, 100])
   })

   it('should say the sentence brain gave when it refuses the form, and a plain one for any other failure', async () => {
      const refused = new TRPCClientError('This type of file cannot be sent.', {
         result: {
            error: {
               message: 'This type of file cannot be sent.',
               code: -32600,
               data: { code: 'PRECONDITION_FAILED' },
            },
         },
      } as never)
      const post = vi.fn()

      await expect(
         createUpload({
            form: async () => {
               throw refused
            },
            post,
         })(UPLOAD, file)
      ).resolves.toEqual({ ok: false, reason: 'This type of file cannot be sent.' })
      await expect(
         createUpload({
            form: async () => {
               throw new Error('boom at 10.0.0.1')
            },
            post,
         })(UPLOAD, file)
      ).resolves.toEqual({ ok: false, reason: 'The file could not be sent. Try again.' })
      expect(post).not.toHaveBeenCalled()
   })

   it('should say a plain sentence, without the answer of the bucket, when the post is refused or the network fails', async () => {
      const refused = createUpload({ form: async () => signed, post: async () => 403 })
      const down = createUpload({
         form: async () => signed,
         post: async () => {
            throw new Error('network down')
         },
      })

      await expect(refused(UPLOAD, file)).resolves.toEqual({
         ok: false,
         reason: 'The file could not be sent. Try again.',
      })
      await expect(down(UPLOAD, file)).resolves.toEqual({
         ok: false,
         reason: 'The file could not be sent. Try again.',
      })
   })
})
