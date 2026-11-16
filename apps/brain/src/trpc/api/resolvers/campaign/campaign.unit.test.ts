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
      start: vi.fn(),
   }
})

vi.mock('database', () => ({
   ConflictError: mocks.ConflictError,
   TaskRefusedError: mocks.TaskRefusedError,
   CampaignTrendService: { insights: mocks.insights },
   CampaignService: { start: mocks.start },
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

   it('should pass the all time period through to the service', async () => {
      mocks.insights.mockResolvedValueOnce({ state: 'empty' })

      await caller().insights({
         id: 'c1',
         period: 'all',
      })

      expect(mocks.insights).toHaveBeenCalledWith('u1', 'c1', 'all')
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

describe('campaign start resolver', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should start the owner campaign and say whether the invites were armed', async () => {
      mocks.start.mockResolvedValueOnce({
         switchedOn: 2,
         armed: 1,
      })

      await expect(
         caller().start({
            id: 'c1',
            sendInvites: true,
         })
      ).resolves.toEqual({
         switchedOn: 2,
         armed: 1,
      })
      expect(mocks.start).toHaveBeenCalledWith('u1', 'c1', { sendInvites: true })
   })

   it('should answer not found for a campaign that is not the owners, and its sentence for a refusal', async () => {
      mocks.start.mockResolvedValueOnce(null)
      mocks.start.mockRejectedValueOnce(new mocks.ConflictError('This campaign is paused. Resume it first.'))

      await expect(
         caller().start({
            id: 'c1',
            sendInvites: false,
         })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(
         caller().start({
            id: 'c1',
            sendInvites: false,
         })
      ).rejects.toMatchObject({
         code: 'CONFLICT',
         message: 'This campaign is paused. Resume it first.',
      })
   })

   it('should not let an anonymous caller start a campaign', async () => {
      const anonymous = router({ campaign }).createCaller({
         auth: null,
         user: null,
      } as unknown as Context)

      await expect(
         anonymous.campaign.start({
            id: 'c1',
            sendInvites: true,
         })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
   })
})
