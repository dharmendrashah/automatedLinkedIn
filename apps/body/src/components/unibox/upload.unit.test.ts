import { describe, expect, it, vi } from 'vitest'

import { createUpload } from './upload'

const UPLOAD = '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34'
const file = new File(['content'], 'My CV.pdf', { type: 'application/pdf' })

const upload = (request: typeof fetch, token: string | null = 't1') =>
   createUpload({
      apiUrl: 'https://api.example.com',
      token: async () => token ?? undefined,
      request,
   })

describe('createUpload', () => {
   it('should post the file to brain with the token and its name encoded, and say it went', async () => {
      const request = vi.fn(async () => new Response('{}', { status: 201 }))

      await expect(upload(request as never)(UPLOAD, file)).resolves.toEqual({ ok: true })

      const [url, options] = request.mock.calls[0] as unknown as [string, RequestInit]

      expect(url).toBe(`https://api.example.com/uploads/${UPLOAD}`)
      expect(options.method).toBe('POST')
      expect(options.body).toBe(file)
      expect(options.headers).toEqual({
         authorization: 'Bearer t1',
         'content-type': 'application/octet-stream',
         'x-file-name': 'My%20CV.pdf',
      })
   })

   it('should say to sign in again when there is no token, without calling brain', async () => {
      const request = vi.fn()

      await expect(upload(request as never, null)(UPLOAD, file)).resolves.toMatchObject({ ok: false })
      expect(request).not.toHaveBeenCalled()
   })

   it('should show the sentence brain gave, and nothing else', async () => {
      const refused = vi.fn(
         async () =>
            new Response(JSON.stringify({ error: 'The file is larger than a reply may carry.' }), { status: 413 })
      )
      const odd = vi.fn(async () => new Response('<html>boom with details</html>', { status: 500 }))
      const down = vi.fn(async () => {
         throw new Error('network down at 10.0.0.1')
      })

      await expect(upload(refused as never)(UPLOAD, file)).resolves.toEqual({
         ok: false,
         reason: 'The file is larger than a reply may carry.',
      })
      await expect(upload(odd as never)(UPLOAD, file)).resolves.toEqual({
         ok: false,
         reason: 'The file could not be sent. Try again.',
      })
      await expect(upload(down as never)(UPLOAD, file)).resolves.toEqual({
         ok: false,
         reason: 'The file could not be sent. Try again.',
      })
   })
})
