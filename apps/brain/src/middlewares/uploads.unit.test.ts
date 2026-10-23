import { Readable } from 'stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Uploads } from './uploads'

const mocks = vi.hoisted(() => {
   class UploadRefused extends Error {
      public constructor(
         public readonly status: number,
         message: string
      ) {
         super(message)
      }
   }

   return {
      UploadRefused,
      bearerToken: vi.fn(),
      authenticate: vi.fn(),
      findByAuthentikId: vi.fn(),
      save: vi.fn(),
   }
})

vi.mock('auth', () => ({
   AuthService: {
      bearerToken: mocks.bearerToken,
      authenticate: mocks.authenticate,
   },
}))
vi.mock('core', () => ({
   UploadFiles: { save: mocks.save },
   UploadRefused: mocks.UploadRefused,
}))
vi.mock('database', () => ({ UserService: { findByAuthentikId: mocks.findByAuthentikId } }))

const UPLOAD = '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34'

const call = async (headers: Record<string, string | undefined>, uploadId = UPLOAD, body = 'content') => {
   let handler: ((request: unknown, response: unknown) => Promise<unknown>) | undefined
   const app = {
      post: vi.fn((_path: string, run: typeof handler) => {
         handler = run
      }),
   }

   Uploads.config(app as never)

   const request = Object.assign(Readable.from([Buffer.from(body)]), {
      params: { uploadId },
      get: (name: string) => headers[name.toLowerCase()],
   })
   const response = {
      code: 0,
      body: undefined as unknown,
      status(code: number) {
         this.code = code

         return this
      },
      json(value: unknown) {
         this.body = value

         return this
      },
   }

   await handler?.(request, response)

   return {
      response,
      app,
   }
}

const signedIn = {
   authorization: 'Bearer t',
   'x-file-name': encodeURIComponent('My CV.pdf'),
}

describe('Uploads', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      mocks.bearerToken.mockReturnValue('t')
      mocks.authenticate.mockResolvedValue({ sub: 's1' })
      mocks.findByAuthentikId.mockResolvedValue({ id: 'u1' })
      mocks.save.mockResolvedValue({
         name: 'My CV.pdf',
         bytes: 7,
      })
   })

   it('should keep the file for the signed-in user under the name it was sent with, and say its kind', async () => {
      const { response, app } = await call(signedIn)

      expect(app.post).toHaveBeenCalledWith('/uploads/:uploadId', expect.any(Function))
      expect(response.code).toBe(201)
      expect(response.body).toEqual({
         name: 'My CV.pdf',
         bytes: 7,
         kind: 'FILE',
      })
      expect(mocks.save).toHaveBeenCalledWith('u1', UPLOAD, 'My CV.pdf', expect.anything())
   })

   it('should refuse a caller who is not signed in, or has no local account', async () => {
      mocks.bearerToken.mockReturnValueOnce(undefined)

      expect((await call({})).response.code).toBe(401)

      mocks.findByAuthentikId.mockResolvedValueOnce(null)

      expect((await call(signedIn)).response.code).toBe(401)
      expect(mocks.save).not.toHaveBeenCalled()
   })

   it('should refuse an upload id or a name that is not valid, and a type that may not be sent', async () => {
      expect((await call(signedIn, '../x')).response.code).toBe(400)
      expect((await call({ authorization: 'Bearer t' })).response.code).toBe(400)
      expect(
         (
            await call({
               authorization: 'Bearer t',
               'x-file-name': '%E0%A4%A',
            })
         ).response.code
      ).toBe(400)
      expect(
         (
            await call({
               authorization: 'Bearer t',
               'x-file-name': 'setup.exe',
            })
         ).response.code
      ).toBe(415)
      expect(mocks.save).not.toHaveBeenCalled()
   })

   it('should make the name safe before it is used', async () => {
      await call({
         authorization: 'Bearer t',
         'x-file-name': encodeURIComponent('../../etc/passwd.txt'),
      })

      expect(mocks.save).toHaveBeenCalledWith('u1', UPLOAD, 'passwd.txt', expect.anything())
   })

   it('should refuse a file that says it is larger than a reply may carry before reading it', async () => {
      const { response } = await call({
         ...signedIn,
         'content-length': String(21 * 1024 * 1024),
      })

      expect(response.code).toBe(413)
      expect(mocks.save).not.toHaveBeenCalled()
   })

   it('should answer with the status and sentence of a refusal, and nothing of any other error', async () => {
      mocks.save.mockRejectedValueOnce(new mocks.UploadRefused(415, 'The file is not what its name says it is.'))
      mocks.save.mockRejectedValueOnce(new Error('bucket secret detail'))
      vi.spyOn(console, 'error').mockImplementation(() => undefined)

      const refused = await call(signedIn)
      const failed = await call(signedIn)

      expect(refused.response.code).toBe(415)
      expect(refused.response.body).toEqual({ error: 'The file is not what its name says it is.' })
      expect(failed.response.code).toBe(500)
      expect(JSON.stringify(failed.response.body)).not.toContain('secret')
   })
})
