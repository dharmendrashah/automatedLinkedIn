import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import { type Context } from '../../context'
import { network } from './network'

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
      waiting: vi.fn(),
      snapshot: vi.fn(),
      refresh: vi.fn(),
      answer: vi.fn(),
   }
})

vi.mock('database', () => ({
   ProxyServerOwnershipError: mocks.ProxyServerOwnershipError,
   TaskOwnershipError: mocks.TaskOwnershipError,
   TaskRefusedError: mocks.TaskRefusedError,
   TaskRecentError: mocks.TaskRecentError,
   ConflictError: class ConflictError extends Error {},
   LinkedInInvitationService: {
      waiting: mocks.waiting,
      snapshot: mocks.snapshot,
      refresh: mocks.refresh,
      answer: mocks.answer,
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
   router({ network }).createCaller({
      auth: {
         token: 'tok',
         sub: 'sub-1',
      },
      user,
   } as unknown as Context).network

describe('network resolvers', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
   })

   it('should hand the owner’s id, never one from the input, to every call', async () => {
      mocks.waiting.mockResolvedValue({ a1: 2 })
      mocks.snapshot.mockResolvedValue({ requests: [] })
      mocks.refresh.mockResolvedValue({ started: true })
      mocks.answer.mockResolvedValue({ started: 1 })

      await caller().waiting({ accountIds: ['a1'] })
      await caller().list({ accountId: 'a1' })
      await caller().refresh({ accountId: 'a1' })
      await caller().answer({
         accountId: 'a1',
         answers: [
            {
               id: 'r1',
               action: 'ACCEPT',
            },
         ],
         startAnyway: true,
      })

      expect(mocks.waiting).toHaveBeenCalledWith('u1', ['a1'])
      expect(mocks.snapshot).toHaveBeenCalledWith('u1', 'a1')
      expect(mocks.refresh).toHaveBeenCalledWith('u1', 'a1', undefined)
      expect(mocks.answer).toHaveBeenCalledWith(
         'u1',
         'a1',
         [
            {
               id: 'r1',
               action: 'ACCEPT',
            },
         ],
         true
      )
   })

   it('should answer a foreign account or request like a missing one', async () => {
      mocks.snapshot.mockResolvedValue(null)
      mocks.refresh.mockResolvedValue(null)
      mocks.answer.mockResolvedValue(null)

      await expect(caller().list({ accountId: 'other' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(caller().refresh({ accountId: 'other' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(
         caller().answer({
            accountId: 'other',
            answers: [
               {
                  id: 'r1',
                  action: 'IGNORE',
               },
            ],
         })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
   })

   it('should tell a refusal as a sentence the owner can read, keeping its cause for the page to tell a budget refusal', async () => {
      const refusal = new mocks.TaskRefusedError('This account is outside its working hours.')

      mocks.refresh.mockRejectedValue(refusal)

      await expect(caller().refresh({ accountId: 'a1' })).rejects.toMatchObject({
         code: 'PRECONDITION_FAILED',
         message: 'This account is outside its working hours.',
         cause: refusal,
      })
   })

   it('should hide the details of an unexpected failure', async () => {
      mocks.answer.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.1'))

      await expect(
         caller().answer({
            accountId: 'a1',
            answers: [
               {
                  id: 'r1',
                  action: 'ACCEPT',
               },
            ],
         })
      ).rejects.toMatchObject({
         code: 'INTERNAL_SERVER_ERROR',
         message: 'Something went wrong. Try again in a moment.',
      })
   })

   it('should accept no answer, and no more than ten at once', async () => {
      const ask = (count: number) =>
         caller().answer({
            accountId: 'a1',
            answers: Array.from({ length: count }, (_, index) => ({
               id: `r${index}`,
               action: 'IGNORE' as const,
            })),
         })

      await expect(ask(0)).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      await expect(ask(11)).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(mocks.answer).not.toHaveBeenCalled()
   })
})
