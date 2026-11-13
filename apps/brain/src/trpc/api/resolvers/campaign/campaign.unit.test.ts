import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import { type Context } from '../../context'
import { campaign } from './campaign'

const mocks = vi.hoisted(() => {
   class ConflictError extends Error {}
   class TaskRefusedError extends Error {}

   return {
      ConflictError,
      TaskRefusedError,
      insights: vi.fn(),
   }
})

vi.mock('database', () => ({
   ConflictError: mocks.ConflictError,
   TaskRefusedError: mocks.TaskRefusedError,
   CampaignTrendService: { insights: mocks.insights },
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

const ctx = {
   auth: {
      token: 'tok',
      sub: 'sub-1',
   },
   user: { id: 'u1' },
} as unknown as Context

const caller = () => router({ campaign }).createCaller(ctx).campaign

describe('campaign insights resolver', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should answer the owner trend for the period asked', async () => {
      const insights = {
         state: 'tooEarly',
         since: null,
      }
      mocks.insights.mockResolvedValueOnce(insights)

      await expect(
         caller().insights({
            id: 'c1',
            period: '30d',
         })
      ).resolves.toEqual(insights)

      expect(mocks.insights).toHaveBeenCalledWith('u1', 'c1', '30d')
   })

   it('should default to the 7 day period', async () => {
      mocks.insights.mockResolvedValueOnce({ state: 'empty' })

      await caller().insights({ id: 'c1' })

      expect(mocks.insights).toHaveBeenCalledWith('u1', 'c1', '7d')
   })

   it('should answer a missing or foreign campaign as not found', async () => {
      mocks.insights.mockResolvedValueOnce(null)

      await expect(caller().insights({ id: 'someone-elses' })).rejects.toMatchObject({
         code: 'NOT_FOUND',
         message: 'Campaign not found',
      })
   })

   it('should refuse a period the page does not offer', async () => {
      await expect(
         caller().insights({
            id: 'c1',
            period: 'today' as '7d',
         })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

      expect(mocks.insights).not.toHaveBeenCalled()
   })
})
