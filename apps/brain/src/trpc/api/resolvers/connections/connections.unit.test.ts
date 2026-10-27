import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import { type Context } from '../../context'
import { connections } from './connections'

const mocks = vi.hoisted(() => {
   class ProxyServerOwnershipError extends Error {}
   class TaskOwnershipError extends Error {}
   class TaskRefusedError extends Error {}
   class TaskRecentError extends TaskRefusedError {}

   return {
      ProxyServerOwnershipError,
      TaskOwnershipError,
      TaskRefusedError,
      TaskRecentError,
      list: vi.fn(),
      refresh: vi.fn(),
      remove: vi.fn(),
   }
})

vi.mock('database', () => ({
   ProxyServerOwnershipError: mocks.ProxyServerOwnershipError,
   TaskOwnershipError: mocks.TaskOwnershipError,
   TaskRefusedError: mocks.TaskRefusedError,
   TaskRecentError: mocks.TaskRecentError,
   ConflictError: class ConflictError extends Error {},
   LinkedInConnectionService: {
      list: mocks.list,
      refresh: mocks.refresh,
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

const caller = () =>
   router({ connections }).createCaller({
      auth: {
         token: 'tok',
         sub: 'sub-1',
      },
      user,
   } as unknown as Context).connections

describe('connections resolvers', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
   })

   it('should hand the owner’s id, never one from the input, to every call', async () => {
      mocks.list.mockResolvedValue({ connections: [] })
      mocks.refresh.mockResolvedValue({ started: true })
      mocks.remove.mockResolvedValue({ started: true })

      await caller().list({ accountId: 'a1' })
      await caller().refresh({ accountId: 'a1' })
      await caller().remove({
         accountId: 'a1',
         id: 'c1',
         startAnyway: true,
      })

      expect(mocks.list).toHaveBeenCalledWith('u1', 'a1')
      expect(mocks.refresh).toHaveBeenCalledWith('u1', 'a1', undefined)
      expect(mocks.remove).toHaveBeenCalledWith('u1', 'a1', 'c1', true)
   })

   it('should answer a foreign account or connection like a missing one', async () => {
      mocks.list.mockResolvedValue(null)
      mocks.refresh.mockResolvedValue(null)
      mocks.remove.mockResolvedValue(null)

      await expect(caller().list({ accountId: 'other' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(caller().refresh({ accountId: 'other' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(
         caller().remove({
            accountId: 'other',
            id: 'c1',
         })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
   })

   it('should tell a refusal as a sentence the owner can read, keeping its cause for the page to tell a budget refusal', async () => {
      mocks.remove.mockRejectedValue(new mocks.TaskRefusedError('This account is outside its working hours.'))

      await expect(
         caller().remove({
            accountId: 'a1',
            id: 'c1',
         })
      ).rejects.toMatchObject({
         code: 'PRECONDITION_FAILED',
         message: 'This account is outside its working hours.',
         cause: expect.any(mocks.TaskRefusedError),
      })
   })

   it('should refuse an empty id', async () => {
      await expect(
         caller().remove({
            accountId: 'a1',
            id: '',
         })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
   })
})
