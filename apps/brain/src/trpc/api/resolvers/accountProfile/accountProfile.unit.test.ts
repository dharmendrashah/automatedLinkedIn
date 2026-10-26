import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import { type Context } from '../../context'
import { accountProfile } from './accountProfile'

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
      state: vi.fn(),
      get: vi.fn(),
      open: vi.fn(),
      request: vi.fn(),
   }
})

vi.mock('database', () => ({
   ProxyServerOwnershipError: mocks.ProxyServerOwnershipError,
   TaskOwnershipError: mocks.TaskOwnershipError,
   TaskRefusedError: mocks.TaskRefusedError,
   TaskRecentError: mocks.TaskRecentError,
   PROFILE_TASK: 'linkedin-profile',
   AccountProfileService: {
      state: mocks.state,
      get: mocks.get,
      open: mocks.open,
   },
   TaskService: { request: mocks.request },
   ConflictError: class ConflictError extends Error {},
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
   router({ accountProfile }).createCaller({
      auth: {
         token: 'tok',
         sub: 'sub-1',
      },
      user,
   } as unknown as Context).accountProfile

describe('accountProfile resolvers', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
   })

   it('should hand the owner’s id, never one from the input, to every call', async () => {
      mocks.state.mockResolvedValue({ phase: 'NEVER' })
      mocks.get.mockResolvedValue({
         profile: null,
         capturedAt: null,
      })
      mocks.open.mockResolvedValue({ started: true })

      await caller().state({ accountId: 'acc1' })
      await caller().get({ accountId: 'acc1' })
      await caller().open({ accountId: 'acc1' })

      expect(mocks.state).toHaveBeenCalledWith('u1', 'acc1')
      expect(mocks.get).toHaveBeenCalledWith('u1', 'acc1')
      expect(mocks.open).toHaveBeenCalledWith('u1', 'acc1')
   })

   it('should answer NOT_FOUND for an account that is not the owner’s', async () => {
      mocks.state.mockResolvedValue(null)
      mocks.open.mockResolvedValue(null)

      await expect(caller().state({ accountId: 'acc1' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(caller().open({ accountId: 'acc1' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
   })

   it('should ask for a manual read of the profile task, and pass on that the owner confirmed it', async () => {
      mocks.request.mockResolvedValue({ id: 's1' })

      await expect(
         caller().read({
            accountId: 'acc1',
            confirmed: true,
         })
      ).resolves.toEqual({ id: 's1' })
      expect(mocks.request).toHaveBeenCalledWith({
         userId: 'u1',
         task: 'linkedin-profile',
         accountId: 'acc1',
         confirmed: true,
         trigger: 'manual',
      })
   })

   it('should pass on that the owner reads although the account may not browse now', async () => {
      mocks.request.mockResolvedValue({ id: 's1' })

      await caller().read({
         accountId: 'acc1',
         startAnyway: true,
      })

      expect(mocks.request).toHaveBeenLastCalledWith(expect.objectContaining({ startAnyway: true }))
   })

   it('should say a recent read needs a confirmation, and that a refused read cannot start', async () => {
      mocks.request.mockRejectedValueOnce(new mocks.TaskRecentError('Wait 20 minute(s) before running this again.'))
      mocks.request.mockRejectedValueOnce(new mocks.TaskRefusedError('Run Test login first.'))
      mocks.request.mockRejectedValueOnce(new Error('connection string with a password'))

      await expect(caller().read({ accountId: 'acc1' })).rejects.toMatchObject({ code: 'CONFLICT' })
      await expect(caller().read({ accountId: 'acc1' })).rejects.toMatchObject({
         code: 'PRECONDITION_FAILED',
         message: 'Run Test login first.',
      })
      await expect(caller().read({ accountId: 'acc1' })).rejects.toMatchObject({
         code: 'INTERNAL_SERVER_ERROR',
         message: 'Something went wrong. Try again in a moment.',
      })
   })
})
