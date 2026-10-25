import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import { type Context } from '../../context'
import { postFile } from './postFile'

const mocks = vi.hoisted(() => {
   class Refused extends Error {
      public readonly status = 413
   }

   return {
      Refused,
      form: vi.fn(),
      confirm: vi.fn(),
      link: vi.fn(),
   }
})

vi.mock('core', () => ({
   UploadRefused: mocks.Refused,
   PostFiles: {
      form: mocks.form,
      confirm: mocks.confirm,
      link: mocks.link,
   },
}))

vi.mock('env', () => ({
   AUTHENTIK_ISSUER: 'http://localhost:9000/application/o/automatedlinkedin/',
   AUTHENTIK_CLIENT_ID: 'automatedlinkedin',
   AUTHENTIK_INTERNAL_URL: '',
   DATABASE_URL: 'postgresql://localhost:5432/test',
   CORS_ORIGINS: 'http://localhost:3000',
   LINKEDIN_CRED_ENC_KEY: 'pqaZGClH/kqxNTLoLT4c0lMTloNIi2At3Jzz9a2rkIQ=',
   GIT_SHA: 'test',
   BUILD_TIME: 'test',
   PORT: 3001,
}))

const user = {
   id: 'u1',
   email: 'ada@elitale.com',
   name: 'Ada',
   role: 'USER',
   authentikId: 'sub-1',
   createdAt: new Date(),
   updatedAt: new Date(),
}

const authed = (): Partial<Context> => ({
   auth: {
      token: 'tok',
      sub: 'sub-1',
   },
   user: user as never,
})

const caller = (ctx: Partial<Context>) => router({ postFile }).createCaller(ctx as Context).postFile

const FILE = '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34'

describe('postFile resolvers', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should reject an anonymous caller', async () => {
      await expect(
         caller({
            auth: null,
            user: null,
         }).form({
            fileId: FILE,
            name: 'a.jpg',
            bytes: 10,
         })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
      expect(mocks.form).not.toHaveBeenCalled()
   })

   it('should ask for a form for the caller and give it back', async () => {
      mocks.form.mockResolvedValueOnce({
         url: 'https://storage.googleapis.com/b/',
         fields: {},
         name: 'a.jpg',
         kind: 'PHOTOS',
      })

      await expect(
         caller(authed()).form({
            fileId: FILE,
            name: 'a.jpg',
            bytes: 10,
         })
      ).resolves.toMatchObject({ name: 'a.jpg' })
      expect(mocks.form).toHaveBeenCalledWith('u1', FILE, 'a.jpg', 10)
   })

   it('should refuse a file id that is not an id of the page, and a size beyond the largest kind', async () => {
      await expect(
         caller(authed()).form({
            fileId: '../x',
            name: 'a.jpg',
            bytes: 10,
         })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      await expect(
         caller(authed()).form({
            fileId: FILE,
            name: 'a.jpg',
            bytes: 600 * 1024 * 1024,
         })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(mocks.form).not.toHaveBeenCalled()
   })

   it('should answer a refusal with its sentence as a failed precondition', async () => {
      mocks.confirm.mockRejectedValueOnce(new mocks.Refused('The file is not what its name says it is.'))

      await expect(
         caller(authed()).confirm({
            fileId: FILE,
            name: 'a.jpg',
         })
      ).rejects.toMatchObject({
         code: 'PRECONDITION_FAILED',
         message: 'The file is not what its name says it is.',
      })
      expect(mocks.confirm).toHaveBeenCalledWith('u1', FILE, 'a.jpg')
   })

   it('should give a link for a key of the caller', async () => {
      mocks.link.mockResolvedValueOnce('https://signed.example/file')

      await expect(
         caller(authed()).link({
            key: `posts/u1/${FILE}/a.jpg`,
            name: 'a.jpg',
         })
      ).resolves.toEqual({ url: 'https://signed.example/file' })
      expect(mocks.link).toHaveBeenCalledWith('u1', `posts/u1/${FILE}/a.jpg`, 'a.jpg')
   })
})
