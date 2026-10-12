import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import { type Context } from '../../context'
import { task } from './task'

const mocks = vi.hoisted(() => {
   class ProxyServerOwnershipError extends Error {}
   class TaskOwnershipError extends Error {}
   class TaskRefusedError extends Error {}

   return {
      ProxyServerOwnershipError,
      TaskOwnershipError,
      TaskRefusedError,
      catalog: vi.fn(),
      request: vi.fn(),
   }
})

vi.mock('database', () => ({
   ProxyServerOwnershipError: mocks.ProxyServerOwnershipError,
   TaskOwnershipError: mocks.TaskOwnershipError,
   TaskRefusedError: mocks.TaskRefusedError,
   TaskService: {
      catalog: mocks.catalog,
      request: mocks.request,
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
   router({ task }).createCaller({
      auth: {
         token: 'tok',
         sub: 'sub-1',
      },
      user,
   } as unknown as Context).task

describe('task resolvers', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
   })

   it('should list the tasks the worker announced, with the labels of the answers the runner gives itself', async () => {
      mocks.catalog.mockResolvedValue([{ task: 'browser-detection' }])

      const catalog = await caller().catalog()

      expect(catalog.tasks).toEqual([{ task: 'browser-detection' }])
      expect(catalog.runnerVerdicts.NOT_QUEUED).toEqual({
         label: expect.any(String),
         tone: 'failure',
      })
   })

   it('should run a task for the current user, and return the session that shows it', async () => {
      mocks.request.mockResolvedValue({ id: 's1' })

      await expect(
         caller().run({
            task: 'browser-detection',
            proxyId: 'p1',
            input: { word: 'hello' },
         })
      ).resolves.toEqual({ id: 's1' })

      expect(mocks.request).toHaveBeenCalledWith({
         userId: 'u1',
         task: 'browser-detection',
         proxyId: 'p1',
         accountId: undefined,
         input: { word: 'hello' },
         trigger: 'manual',
      })
   })

   it('should answer not found for a proxy or account that is not the users', async () => {
      mocks.request.mockRejectedValueOnce(new mocks.ProxyServerOwnershipError('nope'))
      mocks.request.mockRejectedValueOnce(new mocks.TaskOwnershipError('nope'))

      await expect(
         caller().run({
            task: 'browser-detection',
            proxyId: 'p1',
         })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(
         caller().run({
            task: 'browser-detection',
            accountId: 'a1',
         })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
   })

   it('should say why when the task cannot run now', async () => {
      mocks.request.mockRejectedValue(new mocks.TaskRefusedError('A browser test is already running.'))

      await expect(
         caller().run({
            task: 'browser-detection',
            proxyId: 'p1',
         })
      ).rejects.toMatchObject({
         code: 'PRECONDITION_FAILED',
         message: 'A browser test is already running.',
      })
   })

   it.each([
      ['a task name that is a path', { task: '../x' }],
      [
         'an input over 8 KB',
         {
            task: 'browser-detection',
            input: { text: 'x'.repeat(9000) },
         },
      ],
      [
         'an input that is not an object',
         {
            task: 'browser-detection',
            input: 'text',
         },
      ],
   ])('should refuse %s before anything runs', async (_name, input) => {
      await expect(caller().run(input as never)).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(mocks.request).not.toHaveBeenCalled()
   })

   it('should not leak an unexpected error', async () => {
      mocks.request.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'))

      await expect(
         caller().run({
            task: 'browser-detection',
            proxyId: 'p1',
         })
      ).rejects.toMatchObject({
         code: 'INTERNAL_SERVER_ERROR',
         message: expect.not.stringContaining('ECONNREFUSED'),
      })
   })

   it('should not let an anonymous caller list or run tasks', async () => {
      const anonymous = router({ task }).createCaller({
         auth: null,
         user: null,
      } as unknown as Context)

      await expect(anonymous.task.catalog()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
      await expect(
         anonymous.task.run({
            task: 'browser-detection',
            proxyId: 'p1',
         })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
   })
})
