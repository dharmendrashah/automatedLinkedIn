import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import { type Context } from '../../context'
import { dashboard } from './dashboard'

const mocks = vi.hoisted(() => ({ overview: vi.fn() }))

vi.mock('database', () => ({ DashboardService: { overview: mocks.overview } }))

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

const callerFor = (role: 'ADMIN' | 'USER') =>
   router({ dashboard }).createCaller({
      auth: {
         token: 'tok',
         sub: 'sub-1',
      },
      user: {
         id: 'u1',
         role,
      },
   } as unknown as Context).dashboard

describe('dashboard resolver', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should pass the overview through unchanged for the signed-in owner, who is not an admin', async () => {
      const overview = {
         generatedAt: '2026-11-15T12:00:00.000Z',
         unavailable: ['drafts'],
      }
      mocks.overview.mockResolvedValueOnce(overview)

      await expect(callerFor('USER').overview()).resolves.toBe(overview)

      expect(mocks.overview).toHaveBeenCalledWith('u1', false)
   })

   it('should tell the service the owner is an admin when the role says so', async () => {
      mocks.overview.mockResolvedValueOnce({})

      await callerFor('ADMIN').overview()

      expect(mocks.overview).toHaveBeenCalledWith('u1', true)
   })
})
