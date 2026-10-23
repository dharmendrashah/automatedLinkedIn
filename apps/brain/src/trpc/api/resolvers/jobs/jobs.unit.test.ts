import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import { type Context } from '../../context'
import { jobs } from './jobs'

const mocks = vi.hoisted(() => ({
   overview: vi.fn(),
   runs: vi.fn(),
   run: vi.fn(),
   messageReads: vi.fn(),
}))

vi.mock('database', () => ({ JobMonitorService: mocks }))

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

const asUser = (role: 'USER' | 'ADMIN'): Partial<Context> => ({
   auth: {
      token: 'tok',
      sub: 'sub-1',
   },
   user: {
      id: 'u1',
      email: 'ada@elitale.com',
      name: 'Ada',
      role,
      authentikId: 'sub-1',
      createdAt: new Date(),
      updatedAt: new Date(),
   } as never,
})

const caller = (ctx: Partial<Context>) => router({ jobs }).createCaller(ctx as Context).jobs

describe('jobs resolvers', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   const calls: Array<[string, (c: ReturnType<typeof caller>) => Promise<unknown>]> = [
      ['overview', c => c.overview()],
      ['runs', c => c.runs({ job: 'account-daily' })],
      ['run', c => c.run({ id: 'r1' })],
      ['messageReads', c => c.messageReads()],
   ]

   it.each(calls)('should refuse %s to a signed-in user who is not the admin', async (_, call) => {
      await expect(call(caller(asUser('USER')))).rejects.toMatchObject({ code: 'FORBIDDEN' })

      expect(mocks.overview).not.toHaveBeenCalled()
      expect(mocks.runs).not.toHaveBeenCalled()
      expect(mocks.run).not.toHaveBeenCalled()
      expect(mocks.messageReads).not.toHaveBeenCalled()
   })

   it.each(calls)('should refuse %s without a token', async (_, call) => {
      await expect(
         call(
            caller({
               auth: null,
               user: null,
            })
         )
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
   })

   it('should give the admin the overview and the message reads', async () => {
      mocks.overview.mockResolvedValueOnce({ jobs: [] })
      mocks.messageReads.mockResolvedValueOnce([])

      await expect(caller(asUser('ADMIN')).overview()).resolves.toEqual({ jobs: [] })
      await expect(caller(asUser('ADMIN')).messageReads()).resolves.toEqual([])
   })

   it('should page the runs of a job, without idle ones unless asked, 50 at a time', async () => {
      mocks.runs.mockResolvedValue({
         runs: [],
         next: null,
      })

      await caller(asUser('ADMIN')).runs({
         job: 'account-daily',
         before: '2026-10-24T10:00:00.000Z',
      })

      expect(mocks.runs).toHaveBeenCalledWith({
         job: 'account-daily',
         includeIdle: false,
         before: new Date('2026-10-24T10:00:00.000Z'),
         limit: 50,
      })
   })

   it('should refuse a limit above 100', async () => {
      await expect(
         caller(asUser('ADMIN')).runs({
            job: 'a',
            limit: 101,
         })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
   })

   it('should answer NOT_FOUND for a run that does not exist', async () => {
      mocks.run.mockResolvedValueOnce(null)

      await expect(caller(asUser('ADMIN')).run({ id: 'missing' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
   })
})
