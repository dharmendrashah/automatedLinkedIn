import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import { type Context } from '../context'
import { visitProcedure } from './pageVisit'

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
      request: vi.fn(),
   }
})

vi.mock('database', () => ({
   ProxyServerOwnershipError: mocks.ProxyServerOwnershipError,
   TaskOwnershipError: mocks.TaskOwnershipError,
   TaskRefusedError: mocks.TaskRefusedError,
   TaskRecentError: mocks.TaskRecentError,
   PageVisitService: { request: mocks.request },
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

const caller = (kind: 'PROFILE' | 'COMPANY') =>
   router({ visit: visitProcedure(kind) }).createCaller({
      auth: {
         token: 'tok',
         sub: 'sub-1',
      },
      user,
   } as unknown as Context).visit

describe('visitProcedure', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
   })

   it('should ask for a saved company, or a pasted company link, as the owner', async () => {
      mocks.request.mockResolvedValue({ id: 's1' })

      await expect(
         caller('COMPANY')({
            accountId: 'acc1',
            id: 'c1',
         })
      ).resolves.toEqual({ id: 's1' })
      await caller('COMPANY')({
         accountId: 'acc1',
         link: 'linkedin.com/company/sample',
         confirmed: true,
      })

      expect(mocks.request).toHaveBeenNthCalledWith(1, 'u1', 'acc1', { companyId: 'c1' }, undefined)
      expect(mocks.request).toHaveBeenNthCalledWith(
         2,
         'u1',
         'acc1',
         {
            kind: 'COMPANY',
            link: 'linkedin.com/company/sample',
         },
         true
      )
   })

   it('should ask for a saved profile as a profile', async () => {
      mocks.request.mockResolvedValue({ id: 's1' })

      await caller('PROFILE')({
         accountId: 'acc1',
         id: 'p1',
      })

      expect(mocks.request).toHaveBeenCalledWith('u1', 'acc1', { profileId: 'p1' }, undefined)
   })

   it('should need exactly one of a saved page and a link, and answer NOT_FOUND for one that is not the owner’s', async () => {
      await expect(caller('COMPANY')({ accountId: 'acc1' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })

      mocks.request.mockResolvedValue(null)
      await expect(
         caller('COMPANY')({
            accountId: 'acc1',
            id: 'c1',
         })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
   })
})
