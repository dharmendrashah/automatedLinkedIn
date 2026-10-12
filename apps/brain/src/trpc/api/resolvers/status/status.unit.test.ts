import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import { type Context } from '../../context'
import { status } from './status'

const mocks = vi.hoisted(() => ({ snapshot: vi.fn() }))

vi.mock('serviceStatus', () => ({ StatusService: { snapshot: mocks.snapshot } }))

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
   isProd: false,
   isDev: true,
}))

const signedIn = {
   auth: {
      token: 'tok',
      sub: 'sub-1',
   },
   user: {
      id: 'u1',
      email: 'ada@elitale.com',
   },
} as unknown as Context

const answer = {
   checkedAt: '2026-10-12T12:00:00.000Z',
   overall: 'live',
   modules: [],
}

describe('status router', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should give the status to anyone who has signed in', async () => {
      mocks.snapshot.mockResolvedValue(answer)

      await expect(router({ status }).createCaller(signedIn).status.get()).resolves.toEqual(answer)
   })

   it('should refuse a caller who is not signed in, without running a single check', async () => {
      await expect(
         router({ status })
            .createCaller({} as Context)
            .status.get()
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
      expect(mocks.snapshot).not.toHaveBeenCalled()
   })
})
