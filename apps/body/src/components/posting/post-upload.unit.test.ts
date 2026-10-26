import { describe, expect, it, vi } from 'vitest'

import { TRPCClientError } from '@trpc/client'

import { createPostUpload } from './post-upload'

const SIGNED = {
   url: 'https://storage.googleapis.com/bucket/',
   fields: { key: 'k' },
   name: 'photo.jpg',
}

const file = new File(['x'], 'Photo.JPG')

const refusal = (message: string) =>
   new TRPCClientError(message, {
      result: {
         error: {
            message,
            code: -32600,
            data: { code: 'PRECONDITION_FAILED' },
         },
      },
   } as never)

const setup = (overrides: Partial<Parameters<typeof createPostUpload>[0]> = {}) => {
   const deps = {
      form: vi.fn().mockResolvedValue(SIGNED),
      confirm: vi.fn().mockResolvedValue({ key: 'posts/u1/f1/photo.jpg', name: 'photo.jpg', bytes: 1 }),
      send: vi.fn().mockResolvedValue(204),
      ...overrides,
   }

   return {
      deps,
      upload: createPostUpload(deps),
   }
}

describe('createPostUpload', () => {
   it('should ask for a form, post the file, confirm it and give the key and the name brain settled on', async () => {
      const { deps, upload } = setup()
      const onProgress = vi.fn()

      await expect(upload('f1', file, onProgress, () => false)).resolves.toEqual({
         ok: true,
         key: 'posts/u1/f1/photo.jpg',
         name: 'photo.jpg',
      })
      expect(deps.form).toHaveBeenCalledWith({ fileId: 'f1', name: 'Photo.JPG', bytes: 1 })
      expect(deps.send).toHaveBeenCalledWith(SIGNED, file, onProgress)
      expect(deps.confirm).toHaveBeenCalledWith({ fileId: 'f1', name: 'photo.jpg' })
   })

   it('should show brain sentence when the form is refused, and post nothing', async () => {
      const { deps, upload } = setup({ form: vi.fn().mockRejectedValue(refusal('The file is larger than 8 MB.')) })

      await expect(upload('f1', file, undefined, () => false)).resolves.toEqual({
         ok: false,
         reason: 'The file is larger than 8 MB.',
      })
      expect(deps.send).not.toHaveBeenCalled()
   })

   it('should answer a plain sentence when the bucket refuses or the network fails, and confirm nothing', async () => {
      const refused = setup({ send: vi.fn().mockResolvedValue(403) })

      await expect(refused.upload('f1', file, undefined, () => false)).resolves.toMatchObject({ ok: false })
      expect(refused.deps.confirm).not.toHaveBeenCalled()

      const offline = setup({ send: vi.fn().mockRejectedValue(new Error('The network failed.')) })
      const answer = await offline.upload('f1', file, undefined, () => false)

      expect(answer).toMatchObject({ ok: false })
      expect(answer.ok === false && answer.reason).toMatch(/could not be uploaded/i)
   })

   it('should show the sentence when the check after the upload refuses the file', async () => {
      const { upload } = setup({ confirm: vi.fn().mockRejectedValue(refusal('The file is not what its name says it is.')) })

      await expect(upload('f1', file, undefined, () => false)).resolves.toEqual({
         ok: false,
         reason: 'The file is not what its name says it is.',
      })
   })

   it('should not confirm a file that was removed while it was uploading', async () => {
      const { deps, upload } = setup()
      const answer = await upload('f1', file, undefined, () => true)

      expect(answer).toEqual({ ok: false, reason: '' })
      expect(deps.confirm).not.toHaveBeenCalled()
   })
})
