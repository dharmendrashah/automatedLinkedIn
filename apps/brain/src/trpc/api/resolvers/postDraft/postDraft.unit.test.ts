import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ConflictError } from 'database'

import { router } from 'trpc'

import { type Context } from '../../context'
import { postDraft } from './postDraft'

const mocks = vi.hoisted(() => {
   class Conflict extends Error {}

   return {
      Conflict,
      list: vi.fn(),
      get: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
   }
})

vi.mock('database', () => ({
   ConflictError: mocks.Conflict,
   PostDraftService: {
      list: mocks.list,
      get: mocks.get,
      save: mocks.save,
      remove: mocks.remove,
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

const caller = (ctx: Partial<Context>) => router({ postDraft }).createCaller(ctx as Context).postDraft

const text = {
   id: 't1',
   type: 'TEXT' as const,
   text: 'Hello',
}

const draft = {
   accountId: 'a1',
   blocks: [text],
   plannedAt: null,
   plannedZone: null,
}

describe('postDraft resolvers', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should reject an anonymous caller', async () => {
      await expect(
         caller({
            auth: null,
            user: null,
         }).list()
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
      expect(mocks.list).not.toHaveBeenCalled()
   })

   it('should list the drafts of the caller only', async () => {
      mocks.list.mockResolvedValueOnce({
         items: [],
         unreadable: 0,
      })

      await caller(authed()).list()

      expect(mocks.list).toHaveBeenCalledWith('u1')
   })

   it('should answer NOT_FOUND for a draft that is not the caller', async () => {
      mocks.get.mockResolvedValueOnce(null)

      await expect(caller(authed()).get({ id: 'x' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      expect(mocks.get).toHaveBeenCalledWith('u1', 'x')
   })

   it('should save a draft for the caller', async () => {
      mocks.save.mockResolvedValueOnce({ id: 'd1' })

      expect(await caller(authed()).save(draft)).toEqual({ id: 'd1' })
      expect(mocks.save).toHaveBeenCalledWith('u1', {
         ...draft,
         audience: 'ANYONE',
         comments: 'ANYONE',
      })
   })

   it('should answer NOT_FOUND when the account or the draft is not the caller', async () => {
      mocks.save.mockResolvedValueOnce(null)

      await expect(caller(authed()).save(draft)).rejects.toMatchObject({ code: 'NOT_FOUND' })
   })

   it('should answer CONFLICT with the sentence when the owner has too many drafts', async () => {
      mocks.save.mockRejectedValueOnce(new ConflictError('You have 200 drafts. Delete one to start another.'))

      await expect(caller(authed()).save(draft)).rejects.toMatchObject({
         code: 'CONFLICT',
         message: 'You have 200 drafts. Delete one to start another.',
      })
   })

   it('should refuse a draft with two attachments before it reaches the service', async () => {
      await expect(
         caller(authed()).save({
            ...draft,
            blocks: [
               {
                  id: 'l1',
                  type: 'LINK',
                  url: 'https://example.com',
               },
               {
                  id: 'v1',
                  type: 'VIDEO',
                  file: {
                     id: 'f1',
                     name: 'clip.mp4',
                     bytes: 10,
                  },
               },
            ],
         })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(mocks.save).not.toHaveBeenCalled()
   })

   it('should remove a draft of the caller and say whether it did', async () => {
      mocks.remove.mockResolvedValueOnce(true)

      expect(await caller(authed()).remove({ id: 'd1' })).toEqual({ removed: true })
      expect(mocks.remove).toHaveBeenCalledWith('u1', 'd1')
   })
})
