import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type TaskCatalogEntry } from '@automatedLinkedIn/contracts'

import { ProxyServerOwnershipError } from './proxyServer.service'
import { TaskOwnershipError, TaskRefusedError, TaskService, TaskUnavailableError } from './task.service'
import { TASK_HOOKS } from './taskHooks'

const mocks = vi.hoisted(() => ({
   findDefinitions: vi.fn(),
   upsertDefinition: vi.fn(),
   findProxy: vi.fn(),
   findAccount: vi.fn(),
   findSession: vi.fn(),
   pickForAccount: vi.fn(),
   startTask: vi.fn(),
   fail: vi.fn(),
   finishTask: vi.fn(),
   publish: vi.fn(),
}))

vi.mock('core', () => ({ TaskQueue: { publish: mocks.publish } }))

vi.mock('./prisma.service', () => ({
   PrismaService: {
      client: {
         taskDefinition: {
            findMany: mocks.findDefinitions,
            upsert: mocks.upsertDefinition,
         },
         proxyServer: { findFirst: mocks.findProxy },
         linkedInAccount: { findFirst: mocks.findAccount },
         spiderSession: { findFirst: mocks.findSession },
      },
   },
}))

vi.mock('./proxyServer.service', () => ({
   ProxyServerService: { pickForAccount: mocks.pickForAccount },
   ProxyServerOwnershipError: class extends Error {},
}))

vi.mock('./spiderSession.service', () => ({
   SpiderSessionService: {
      startTask: mocks.startTask,
      fail: mocks.fail,
      finishTask: mocks.finishTask,
   },
}))

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

const entry = (overrides: Partial<TaskCatalogEntry> = {}): TaskCatalogEntry => ({
   contract: 1,
   task: 'browser-detection',
   version: 1,
   title: 'Browser test',
   description: 'Checks the browser.',
   input_schema: { type: 'object' },
   needs: {
      proxy: 'required',
      account: false,
   },
   verdicts: {
      NOT_DETECTED: {
         label: 'Not detected',
         tone: 'success',
      },
   },
   policy: {
      cooldown_ms: 5 * MINUTE_MS,
      one_at_a_time: 'proxy',
      automatic: [
         {
            on: 'proxy.active',
            every_ms: 24 * HOUR_MS,
         },
      ],
   },
   hosts: ['pixelscan.net'],
   ...overrides,
})

const definition = (overrides: Partial<TaskCatalogEntry> = {}) => {
   const manifest = entry(overrides)

   return {
      task: manifest.task,
      version: manifest.version,
      manifest,
   }
}

const picked = {
   config: {
      server: 'http://proxy.example.net:8080',
      username: 'ada',
      password: 'secret',
   },
   summary: {
      id: 'p1',
      protocol: 'HTTP' as const,
      host: 'proxy.example.net',
      port: 8080,
      country: 'Canada',
   },
}

const ago = (ms: number) => new Date(Date.now() - ms)

describe('TaskService', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)

      for (const key of Object.keys(TASK_HOOKS)) {
         delete TASK_HOOKS[key]
      }

      mocks.findDefinitions.mockResolvedValue([definition()])
      mocks.findProxy.mockResolvedValue({
         id: 'p1',
         linkedInAccountId: 'acc1',
      })
      mocks.findAccount.mockResolvedValue({
         id: 'acc1',
         secret: 'Y2lwaGVy',
         secretIv: 'aXY=',
         secretTag: 'dGFn',
         keyVersion: 1,
      })
      mocks.findSession.mockResolvedValue(null)
      mocks.pickForAccount.mockResolvedValue(picked)
      mocks.startTask.mockResolvedValue(undefined)
      mocks.fail.mockResolvedValue(undefined)
      mocks.publish.mockResolvedValue(undefined)
   })

   describe('catalog', () => {
      it('should hand out the latest version of every task the worker announced', async () => {
         mocks.findDefinitions.mockResolvedValue([
            definition(),
            definition({
               task: 'linkedin-login',
               title: 'Sign in',
            }),
         ])

         const tasks = await TaskService.catalog()

         expect(tasks.map(task => task.task)).toEqual(['browser-detection', 'linkedin-login'])
         expect(mocks.findDefinitions).toHaveBeenCalledWith(
            expect.objectContaining({
               distinct: ['task'],
               orderBy: [{ task: 'asc' }, { version: 'desc' }],
            })
         )
      })

      it('should leave out a stored manifest that is no longer valid', async () => {
         mocks.findDefinitions.mockResolvedValue([
            definition(),
            {
               task: 'broken',
               version: 1,
               manifest: { nope: true },
            },
         ])

         await expect(TaskService.catalog()).resolves.toHaveLength(1)
      })
   })

   describe('applyCatalog', () => {
      it('should remember every announced task and version, replacing what it knew', async () => {
         mocks.upsertDefinition.mockResolvedValue(undefined)

         await TaskService.applyCatalog({
            contract: 1,
            announced_at: '2026-10-13T10:00:00.000Z',
            worker: { build: 'abc1234' },
            tasks: [entry(), entry({ task: 'linkedin-login' })],
         })

         expect(mocks.upsertDefinition).toHaveBeenCalledTimes(2)
         expect(mocks.upsertDefinition).toHaveBeenCalledWith({
            where: {
               task_version: {
                  task: 'browser-detection',
                  version: 1,
               },
            },
            create: {
               task: 'browser-detection',
               version: 1,
               manifest: entry(),
            },
            update: expect.objectContaining({ manifest: entry() }),
         })
      })
   })

   describe('request', () => {
      const ask = (patch: Partial<Parameters<typeof TaskService.request>[0]> = {}) =>
         TaskService.request({
            userId: 'u1',
            task: 'browser-detection',
            proxyId: 'p1',
            trigger: 'manual',
            ...patch,
         })

      it('should note the session, then queue the command through the proxy, and return the session id', async () => {
         const { id } = await ask()

         expect(mocks.findProxy).toHaveBeenCalledWith(
            expect.objectContaining({
               where: {
                  id: 'p1',
                  linkedInAccount: { userId: 'u1' },
               },
            })
         )
         expect(mocks.pickForAccount).toHaveBeenCalledWith('acc1', 'p1')
         expect(mocks.startTask).toHaveBeenCalledWith({
            id,
            userId: 'u1',
            linkedInAccountId: 'acc1',
            proxy: picked.summary,
            task: 'browser-detection',
            taskVersion: 1,
            trigger: 'manual',
            input: {},
            startedAt: expect.any(Date),
         })
         expect(mocks.publish).toHaveBeenCalledWith({
            contract: 1,
            task_id: id,
            user_id: 'u1',
            task: 'browser-detection',
            task_version: 1,
            requested_at: mocks.startTask.mock.calls[0][0].startedAt.toISOString(),
            trigger: 'manual',
            proxy: picked.config,
            input: {},
         })
         expect(mocks.startTask.mock.invocationCallOrder[0]).toBeLessThan(mocks.publish.mock.invocationCallOrder[0])
      })

      it('should pass the input along without reading it', async () => {
         await ask({ input: { word: 'hello' } })

         expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ input: { word: 'hello' } }))
      })

      it('should refuse a task the worker never announced', async () => {
         await expect(ask({ task: 'nothing' })).rejects.toBeInstanceOf(TaskUnavailableError)
         expect(mocks.publish).not.toHaveBeenCalled()
      })

      it("should say not found for someone else's proxy", async () => {
         mocks.findProxy.mockResolvedValue(null)

         await expect(ask({ userId: 'u2' })).rejects.toBeInstanceOf(ProxyServerOwnershipError)
         expect(mocks.publish).not.toHaveBeenCalled()
      })

      it('should refuse a proxy that does not work, for a task that needs one', async () => {
         mocks.pickForAccount.mockResolvedValue(null)

         await expect(ask()).rejects.toBeInstanceOf(TaskRefusedError)
         expect(mocks.publish).not.toHaveBeenCalled()
      })

      it('should refuse a task that has neither a proxy nor an account to belong to', async () => {
         await expect(ask({ proxyId: undefined })).rejects.toBeInstanceOf(TaskRefusedError)
      })

      it('should pick the best proxy of an account when none was named, and send the sealed credentials to a task that needs the account', async () => {
         mocks.findDefinitions.mockResolvedValue([
            definition({
               task: 'linkedin-login',
               needs: {
                  proxy: 'required',
                  account: true,
               },
               policy: {
                  cooldown_ms: 0,
                  one_at_a_time: 'account',
               },
            }),
         ])

         await ask({
            task: 'linkedin-login',
            proxyId: undefined,
            accountId: 'acc1',
         })

         expect(mocks.findAccount).toHaveBeenCalledWith(
            expect.objectContaining({
               where: {
                  id: 'acc1',
                  userId: 'u1',
               },
            })
         )
         expect(mocks.pickForAccount).toHaveBeenCalledWith('acc1', undefined)
         expect(mocks.publish).toHaveBeenCalledWith(
            expect.objectContaining({
               account_id: 'acc1',
               credentials: {
                  ciphertext: 'Y2lwaGVy',
                  iv: 'aXY=',
                  tag: 'dGFn',
                  key_version: 1,
               },
            })
         )
      })

      it('should never send credentials to a task that does not need an account', async () => {
         await ask()

         expect(mocks.publish.mock.calls[0][0]).not.toHaveProperty('credentials')
         expect(mocks.publish.mock.calls[0][0]).not.toHaveProperty('account_id')
      })

      it("should say not found for someone else's account", async () => {
         mocks.findAccount.mockResolvedValue(null)

         await expect(
            ask({
               proxyId: undefined,
               accountId: 'acc9',
            })
         ).rejects.toBeInstanceOf(TaskOwnershipError)
      })

      it('should refuse a proxy that belongs to another account than the one named', async () => {
         await expect(ask({ accountId: 'acc2' })).rejects.toBeInstanceOf(TaskRefusedError)
      })

      it('should refuse while a run of this task is going on for the same proxy', async () => {
         mocks.findSession.mockResolvedValue({
            status: 'IN_PROGRESS',
            startedAt: ago(10 * MINUTE_MS),
         })

         await expect(ask()).rejects.toThrow('already running')
         expect(mocks.findSession).toHaveBeenCalledWith(
            expect.objectContaining({
               where: {
                  task: 'browser-detection',
                  kind: 'TASK',
                  proxyServerId: 'p1',
               },
            })
         )
      })

      it('should scope the check to the account, or to the user, as the task asks', async () => {
         mocks.findDefinitions.mockResolvedValue([
            definition({
               policy: {
                  cooldown_ms: 0,
                  one_at_a_time: 'account',
               },
            }),
         ])
         await ask()

         expect(mocks.findSession).toHaveBeenLastCalledWith(
            expect.objectContaining({
               where: {
                  task: 'browser-detection',
                  kind: 'TASK',
                  linkedInAccountId: 'acc1',
               },
            })
         )

         mocks.findDefinitions.mockResolvedValue([
            definition({
               policy: {
                  cooldown_ms: 0,
                  one_at_a_time: 'none',
               },
            }),
         ])
         await ask()

         expect(mocks.findSession).toHaveBeenLastCalledWith(
            expect.objectContaining({
               where: {
                  task: 'browser-detection',
                  kind: 'TASK',
                  userId: 'u1',
               },
            })
         )
      })

      it('should not be blocked for ever by a run that never answered', async () => {
         mocks.findSession.mockResolvedValue({
            status: 'IN_PROGRESS',
            startedAt: ago(2 * HOUR_MS),
         })

         await expect(ask()).resolves.toEqual({ id: expect.any(String) })
      })

      it('should keep the cooldown of the task between two runs, and say how long is left', async () => {
         mocks.findSession.mockResolvedValue({
            status: 'FAILED',
            startedAt: ago(2 * MINUTE_MS),
         })

         await expect(ask()).rejects.toThrow('3 minute')

         mocks.findSession.mockResolvedValue({
            status: 'SUCCEEDED',
            startedAt: ago(6 * MINUTE_MS),
         })

         await expect(ask()).resolves.toEqual({ id: expect.any(String) })
      })

      it('should end the session as not queued and refuse when the command cannot be queued', async () => {
         mocks.publish.mockRejectedValue(new Error('nack from broker'))

         await expect(ask()).rejects.toThrow('could not be queued')
         expect(mocks.fail).toHaveBeenCalledWith(mocks.startTask.mock.calls[0][0].id, expect.any(String), 'NOT_QUEUED')
      })

      it('should queue nothing when the session cannot be saved', async () => {
         mocks.startTask.mockRejectedValue(new Error('database down'))

         await expect(ask()).rejects.toThrow()
         expect(mocks.publish).not.toHaveBeenCalled()
      })

      it('should let the hook of the task refuse the request before anything is saved', async () => {
         TASK_HOOKS['browser-detection'] = {
            onRequest: vi.fn(async () => {
               throw new TaskRefusedError('Resume the account first.')
            }),
         }

         await expect(ask()).rejects.toThrow('Resume the account first.')
         expect(mocks.startTask).not.toHaveBeenCalled()
      })

      it('should run the request hook with what it needs to decide', async () => {
         const onRequest = vi.fn(async () => undefined)

         TASK_HOOKS['browser-detection'] = { onRequest }

         const { id } = await ask()

         expect(onRequest).toHaveBeenCalledWith({
            id,
            userId: 'u1',
            accountId: 'acc1',
            proxyId: 'p1',
            task: 'browser-detection',
            trigger: 'manual',
         })
      })
   })

   describe('emit', () => {
      it('should start every task that listens to the event, for the owner of the proxy, as automatic', async () => {
         mocks.findProxy.mockImplementation(async (arguments_: { select?: { linkedInAccount?: unknown } }) =>
            arguments_.select?.linkedInAccount
               ? {
                    id: 'p1',
                    linkedInAccountId: 'acc1',
                    linkedInAccount: { userId: 'u1' },
                 }
               : {
                    id: 'p1',
                    linkedInAccountId: 'acc1',
                 }
         )

         await expect(TaskService.emit('proxy.active', { proxyId: 'p1' })).resolves.toBe(1)

         expect(mocks.startTask).toHaveBeenCalledWith(
            expect.objectContaining({
               userId: 'u1',
               trigger: 'automatic',
               task: 'browser-detection',
            })
         )
      })

      it('should skip a task that already ran inside its own interval, unless the connection changed', async () => {
         mocks.findProxy.mockResolvedValue({
            id: 'p1',
            linkedInAccountId: 'acc1',
            linkedInAccount: { userId: 'u1' },
         })
         mocks.findSession.mockResolvedValue({
            status: 'SUCCEEDED',
            startedAt: ago(2 * HOUR_MS),
         })

         await expect(TaskService.emit('proxy.active', { proxyId: 'p1' })).resolves.toBe(0)
         await expect(
            TaskService.emit('proxy.active', {
               proxyId: 'p1',
               changed: true,
            })
         ).resolves.toBe(1)
      })

      it('should ignore tasks that do not listen to the event', async () => {
         mocks.findDefinitions.mockResolvedValue([
            definition({
               policy: {
                  cooldown_ms: 0,
                  one_at_a_time: 'none',
               },
            }),
         ])

         await expect(TaskService.emit('proxy.active', { proxyId: 'p1' })).resolves.toBe(0)
         expect(mocks.publish).not.toHaveBeenCalled()
      })

      it('should never throw, so the change that caused the event cannot fail', async () => {
         mocks.findDefinitions.mockRejectedValue(new Error('database down'))

         await expect(TaskService.emit('proxy.active', { proxyId: 'p1' })).resolves.toBe(0)
         expect(console.error).toHaveBeenCalledWith(expect.stringContaining('database down'))
      })
   })

   describe('applyResult', () => {
      const result = {
         contract: 1 as const,
         task_id: '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11',
         task: 'browser-detection',
         task_version: 1,
         status: 'SUCCEEDED' as const,
         verdict: 'NOT_DETECTED',
         message: 'ok',
         artifacts: [],
         artifacts_truncated: false,
         worker: { build: 'abc1234' },
         started_at: '2026-10-13T10:00:00.000Z',
         finished_at: '2026-10-13T10:01:00.000Z',
      }

      it('should finish the session, then give the hook of the task the session and the result', async () => {
         const session = {
            id: result.task_id,
            userId: 'u1',
            linkedInAccountId: 'acc1',
         }
         const onResult = vi.fn(async () => undefined)

         TASK_HOOKS['browser-detection'] = { onResult }
         mocks.finishTask.mockResolvedValue(session)

         await expect(TaskService.applyResult(result)).resolves.toBe(true)

         expect(onResult).toHaveBeenCalledWith(session, result)
      })

      it('should do nothing for a result that did not finish a session, such as a repeated one', async () => {
         const onResult = vi.fn()

         TASK_HOOKS['browser-detection'] = { onResult }
         mocks.finishTask.mockResolvedValue(null)

         await expect(TaskService.applyResult(result)).resolves.toBe(false)
         expect(onResult).not.toHaveBeenCalled()
      })

      it('should work for a task without a hook', async () => {
         mocks.finishTask.mockResolvedValue({ id: result.task_id })

         await expect(TaskService.applyResult(result)).resolves.toBe(true)
      })
   })
})
