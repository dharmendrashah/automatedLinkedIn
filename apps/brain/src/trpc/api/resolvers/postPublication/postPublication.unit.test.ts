import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import { type Context } from '../../context'
import { postPublication } from './postPublication'

const mocks = vi.hoisted(() => ({
   list: vi.fn(),
   get: vi.fn(),
   publish: vi.fn(),
   schedule: vi.fn(),
   backToDraft: vi.fn(),
   duplicate: vi.fn(),
   TaskRefusedError: class TaskRefusedError extends Error {},
   ConflictError: class ConflictError extends Error {},
}))

vi.mock('database', () => ({
   PostPublicationService: {
      list: mocks.list,
      get: mocks.get,
      publish: mocks.publish,
      schedule: mocks.schedule,
      backToDraft: mocks.backToDraft,
      duplicate: mocks.duplicate,
   },
   TaskRefusedError: mocks.TaskRefusedError,
   ConflictError: mocks.ConflictError,
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
   role: 'USER' as const,
   authentikId: 'sub-1',
   createdAt: new Date(),
   updatedAt: new Date(),
   inboxSeenAt: null,
}

const authed = (): Partial<Context> => ({
   auth: {
      token: 'tok',
      sub: 'sub-1',
   },
   user,
})

const notFound = { code: 'NOT_FOUND' }
const conflict = { code: 'CONFLICT' }

const caller = (context: Partial<Context>) => router({ postPublication }).createCaller(context as Context)

describe('postPublication router', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should refuse a caller who is not signed in', async () => {
      await expect(caller({}).postPublication.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
      expect(mocks.list).not.toHaveBeenCalled()
   })

   it('should list and get the posts of the signed-in owner only, and answer a missing one as not found', async () => {
      mocks.list.mockResolvedValue([])
      mocks.get.mockResolvedValueOnce(null)

      await caller(authed()).postPublication.list()

      expect(mocks.list).toHaveBeenCalledWith('u1')
      await expect(caller(authed()).postPublication.get({ id: 'p1' })).rejects.toMatchObject(notFound)
      expect(mocks.get).toHaveBeenCalledWith('u1', 'p1')
   })

   it("should send a draft for posting now or plan it, and answer a draft that is not the owner's as not found", async () => {
      mocks.publish.mockResolvedValueOnce({
         id: 'p1',
         state: 'SENDING',
      })
      mocks.schedule.mockResolvedValueOnce({
         id: 'p2',
         state: 'SCHEDULED',
      })
      mocks.publish.mockResolvedValueOnce(null)

      await expect(caller(authed()).postPublication.publish({ draftId: 'd1' })).resolves.toMatchObject({ id: 'p1' })
      await expect(caller(authed()).postPublication.schedule({ draftId: 'd2' })).resolves.toMatchObject({ id: 'p2' })
      await expect(caller(authed()).postPublication.publish({ draftId: 'x' })).rejects.toMatchObject(notFound)
      expect(mocks.publish).toHaveBeenCalledWith('u1', 'd1')
      expect(mocks.schedule).toHaveBeenCalledWith('u1', 'd2')
   })

   it('should answer a refusal that has a sentence as a failed precondition, with the sentence', async () => {
      mocks.publish.mockRejectedValueOnce(new mocks.TaskRefusedError('Leave at least an hour between two posts.'))

      await expect(caller(authed()).postPublication.publish({ draftId: 'd1' })).rejects.toMatchObject({
         code: 'PRECONDITION_FAILED',
         message: 'Leave at least an hour between two posts.',
      })
   })

   it('should take a post back to a draft, and answer one that cannot be taken back as a conflict', async () => {
      mocks.backToDraft.mockResolvedValueOnce({ id: 'd9' })
      mocks.backToDraft.mockResolvedValueOnce(null)

      await expect(caller(authed()).postPublication.backToDraft({ id: 'p1' })).resolves.toEqual({ id: 'd9' })
      await expect(caller(authed()).postPublication.backToDraft({ id: 'p2' })).rejects.toMatchObject(conflict)
      expect(mocks.backToDraft).toHaveBeenCalledWith('u1', 'p1')
   })

   it('should copy a post into a draft of the owner, and answer a missing post as not found and a full draft list as a conflict', async () => {
      mocks.duplicate.mockResolvedValueOnce({ id: 'd2' })
      mocks.duplicate.mockResolvedValueOnce(null)
      mocks.duplicate.mockRejectedValueOnce(
         new mocks.ConflictError('You have 200 drafts. Delete one to start another.')
      )

      await expect(caller(authed()).postPublication.duplicate({ id: 'p1' })).resolves.toMatchObject({ id: 'd2' })
      await expect(caller(authed()).postPublication.duplicate({ id: 'x' })).rejects.toMatchObject(notFound)
      await expect(caller(authed()).postPublication.duplicate({ id: 'p1' })).rejects.toMatchObject(conflict)
      expect(mocks.duplicate).toHaveBeenCalledWith('u1', 'p1')
   })
})
