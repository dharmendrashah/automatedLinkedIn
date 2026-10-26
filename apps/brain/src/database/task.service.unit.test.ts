import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type TaskCatalogEntry } from '@automatedLinkedIn/contracts'

import { ProxyServerOwnershipError } from './proxyServer.service'
import { TaskService } from './task.service'
import {
   TaskBusyError,
   TaskNeedsProxyError,
   TaskOwnershipError,
   TaskRecentError,
   TaskRefusedError,
   TaskUnavailableError,
} from './taskErrors'
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
   deleteExpired: vi.fn(),
   dispatch: vi.fn(),
   transaction: vi.fn(),
   createDispatch: vi.fn(),
   reserve: vi.fn(),
   settle: vi.fn(),
}))

vi.mock('./browseBudget.service', () => ({
   BrowseBudgetService: {
      reserve: mocks.reserve,
      settle: mocks.settle,
   },
   DEFAULT_BUDGET: {
      estimate_s: 300,
      class: 'ACTION',
   },
}))

vi.mock('./taskDispatch.service', () => ({ TaskDispatchService: { dispatch: mocks.dispatch } }))

const tx = { taskDispatch: { create: mocks.createDispatch } }

vi.mock('./prisma.service', () => ({
   PrismaService: {
      client: {
         $transaction: mocks.transaction,
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
      deleteExpired: mocks.deleteExpired,
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
         email: 'ada@work.com',
         secret: 'Y2lwaGVy',
         secretIv: 'aXY=',
         secretTag: 'dGFn',
         keyVersion: 1,
      })
      mocks.findSession.mockResolvedValue(null)
      mocks.pickForAccount.mockResolvedValue(picked)
      mocks.startTask.mockResolvedValue(undefined)
      mocks.fail.mockResolvedValue(undefined)
      mocks.dispatch.mockResolvedValue({ outcome: 'published' })
      mocks.deleteExpired.mockResolvedValue(undefined)
      mocks.createDispatch.mockResolvedValue({})
      mocks.transaction.mockImplementation(async (work: (client: unknown) => Promise<unknown>) => work(tx))
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
         expect(mocks.startTask).toHaveBeenCalledWith(
            {
               id,
               userId: 'u1',
               linkedInAccountId: 'acc1',
               proxy: picked.summary,
               task: 'browser-detection',
               taskVersion: 1,
               trigger: 'manual',
               input: {},
               startedAt: expect.any(Date),
            },
            tx
         )
         expect(mocks.createDispatch).toHaveBeenCalledWith({ data: { sessionId: id } })
         expect(mocks.dispatch).toHaveBeenCalledWith(id)
         expect(mocks.createDispatch.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.dispatch.mock.invocationCallOrder[0]
         )
         expect(mocks.deleteExpired).toHaveBeenCalledTimes(1)
      })

      it('should pass the input along without reading it', async () => {
         await ask({ input: { word: 'hello' } })

         expect(mocks.startTask).toHaveBeenCalledWith(expect.objectContaining({ input: { word: 'hello' } }), tx)
      })

      it('should refuse a task the worker never announced', async () => {
         await expect(ask({ task: 'nothing' })).rejects.toBeInstanceOf(TaskUnavailableError)
         expect(mocks.dispatch).not.toHaveBeenCalled()
      })

      it("should say not found for someone else's proxy", async () => {
         mocks.findProxy.mockResolvedValue(null)

         await expect(ask({ userId: 'u2' })).rejects.toBeInstanceOf(ProxyServerOwnershipError)
         expect(mocks.dispatch).not.toHaveBeenCalled()
      })

      it('should refuse a proxy that does not work, for a task that needs one', async () => {
         mocks.pickForAccount.mockResolvedValue(null)

         await expect(ask()).rejects.toBeInstanceOf(TaskNeedsProxyError)
         expect(mocks.dispatch).not.toHaveBeenCalled()
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
         // The sealed credentials are added to the command when it is published, not stored with the task.
         expect(mocks.startTask).toHaveBeenCalledWith(
            expect.objectContaining({
               task: 'linkedin-login',
               linkedInAccountId: 'acc1',
            }),
            tx
         )
         expect(mocks.dispatch).toHaveBeenCalledTimes(1)
      })

      it('should refuse an input that can never be published, and save nothing', async () => {
         await expect(ask({ input: { big: 'x'.repeat(9000) } })).rejects.toBeInstanceOf(TaskRefusedError)

         expect(mocks.transaction).not.toHaveBeenCalled()
         expect(mocks.dispatch).not.toHaveBeenCalled()
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
         await expect(ask()).rejects.toBeInstanceOf(TaskBusyError)
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

      it('should keep the cooldown of the task after a good run, and say how long is left', async () => {
         mocks.findSession.mockResolvedValue({
            status: 'SUCCEEDED',
            startedAt: ago(2 * MINUTE_MS),
         })

         await expect(ask()).rejects.toThrow('3 minute')
         await expect(ask()).rejects.toBeInstanceOf(TaskRecentError)

         mocks.findSession.mockResolvedValue({
            status: 'SUCCEEDED',
            startedAt: ago(6 * MINUTE_MS),
         })

         await expect(ask()).resolves.toEqual({ id: expect.any(String) })
      })

      it('should run inside the cooldown once the owner confirmed it, but never beside a run in progress', async () => {
         mocks.findSession.mockResolvedValue({
            status: 'SUCCEEDED',
            startedAt: ago(2 * MINUTE_MS),
         })

         await expect(ask({ confirmed: true })).resolves.toEqual({ id: expect.any(String) })

         mocks.findSession.mockResolvedValue({
            status: 'IN_PROGRESS',
            startedAt: ago(MINUTE_MS),
         })

         await expect(ask({ confirmed: true })).rejects.toThrow('already running')
      })

      it('should run again at once after a run that failed', async () => {
         mocks.findSession.mockResolvedValue({
            status: 'FAILED',
            startedAt: ago(MINUTE_MS),
         })

         await expect(ask()).resolves.toEqual({ id: expect.any(String) })
      })

      it('should accept the task when it cannot be published right away: it is saved and the worker publishes it', async () => {
         mocks.dispatch.mockRejectedValue(new Error('nack from broker'))

         await expect(ask()).resolves.toEqual({ id: expect.any(String) })
         expect(mocks.startTask).toHaveBeenCalledTimes(1)
         expect(mocks.createDispatch).toHaveBeenCalledTimes(1)
         expect(mocks.fail).not.toHaveBeenCalled()
      })

      it('should save nothing when any step of the transaction fails', async () => {
         mocks.createDispatch.mockRejectedValue(new Error('database down'))

         await expect(ask()).rejects.toThrow('database down')
         expect(mocks.dispatch).not.toHaveBeenCalled()
      })

      it('should queue nothing when the session cannot be saved', async () => {
         mocks.startTask.mockRejectedValue(new Error('database down'))

         await expect(ask()).rejects.toThrow()
         expect(mocks.createDispatch).not.toHaveBeenCalled()
         expect(mocks.dispatch).not.toHaveBeenCalled()
      })

      it('should let the hook of the task refuse the request before anything is saved', async () => {
         TASK_HOOKS['browser-detection'] = {
            onRequest: vi.fn(async () => {
               throw new TaskRefusedError('Resume the account first.')
            }),
         }

         await expect(ask()).rejects.toThrow('Resume the account first.')
         expect(mocks.startTask).not.toHaveBeenCalled()
         expect(mocks.createDispatch).not.toHaveBeenCalled()
      })

      it('should run the request hook inside the transaction, with what it needs to decide', async () => {
         const onRequest = vi.fn(async () => undefined)

         TASK_HOOKS['browser-detection'] = { onRequest }

         const { id } = await ask()

         expect(onRequest).toHaveBeenCalledWith(
            {
               id,
               userId: 'u1',
               accountId: 'acc1',
               proxyId: 'p1',
               task: 'browser-detection',
               trigger: 'manual',
            },
            tx
         )
      })
   })

   describe('browsing time', () => {
      const ask = () =>
         TaskService.request({
            userId: 'u1',
            task: 'browser-detection',
            proxyId: 'p1',
            trigger: 'automatic',
         })

      it('should book the session in the transaction that saves it, with the budget of the task and who asked', async () => {
         mocks.findDefinitions.mockResolvedValue([
            definition({
               budget: {
                  estimate_s: 240,
                  class: 'BACKGROUND',
               },
            }),
         ])

         const { id } = await ask()

         expect(mocks.reserve).toHaveBeenCalledWith(tx, {
            accountId: 'acc1',
            sessionId: id,
            budget: {
               estimate_s: 240,
               class: 'BACKGROUND',
            },
            trigger: 'automatic',
         })
      })

      it('should assume an action of 5 minutes for a task that announced no budget', async () => {
         await ask()

         expect(mocks.reserve).toHaveBeenCalledWith(
            tx,
            expect.objectContaining({
               budget: {
                  estimate_s: 300,
                  class: 'ACTION',
               },
            })
         )
      })

      it('should let the owner start past the browsing time, and never an automatic start', async () => {
         const start = (trigger: 'manual' | 'automatic') =>
            TaskService.request({
               userId: 'u1',
               task: 'browser-detection',
               proxyId: 'p1',
               trigger,
               startAnyway: true,
            })

         await start('manual')
         expect(mocks.reserve).toHaveBeenLastCalledWith(tx, expect.objectContaining({ override: true }))

         await start('automatic')
         expect(mocks.reserve).toHaveBeenLastCalledWith(tx, expect.not.objectContaining({ override: true }))
      })

      it('should save nothing and publish nothing when the account has no browsing time', async () => {
         mocks.reserve.mockRejectedValue(new TaskRefusedError('This account has used its browsing time for today.'))

         await expect(ask()).rejects.toThrow('This account has used its browsing time for today.')
         expect(mocks.startTask).not.toHaveBeenCalled()
         expect(mocks.createDispatch).not.toHaveBeenCalled()
         expect(mocks.dispatch).not.toHaveBeenCalled()
      })

      it('should book what a session used when its answer is applied, before the hook of the task', async () => {
         const order: string[] = []
         const session = {
            id: 'sess1',
            userId: 'u1',
            linkedInAccountId: 'acc1',
         }
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
            browser_seconds: 58,
         }

         mocks.settle.mockImplementation(async () => {
            order.push('settle')
         })
         TASK_HOOKS['browser-detection'] = {
            onResult: async () => {
               order.push('hook')
            },
         }
         mocks.finishTask.mockImplementation(
            async (_result: unknown, after: (finished: typeof session, tx: unknown) => Promise<void>) => {
               await after(session, tx)

               return session
            }
         )

         await TaskService.applyResult(result)

         expect(mocks.settle).toHaveBeenCalledWith(tx, 'sess1', result)
         expect(order).toEqual(['settle', 'hook'])
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
            }),
            tx
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
         expect(mocks.dispatch).not.toHaveBeenCalled()
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

      it('should finish the session, then give the hook of the task the session, the result and the transaction', async () => {
         const session = {
            id: result.task_id,
            userId: 'u1',
            linkedInAccountId: 'acc1',
         }
         const tx = {}
         const onResult = vi.fn(async () => undefined)

         TASK_HOOKS['browser-detection'] = { onResult }
         mocks.finishTask.mockImplementation(
            async (_result: unknown, after: (finished: typeof session, tx: unknown) => Promise<void>) => {
               await after(session, tx)

               return session
            }
         )

         await expect(TaskService.applyResult(result)).resolves.toBe(true)

         expect(onResult).toHaveBeenCalledWith(session, result, tx)
      })

      it('should let the failure of a hook through, so the result is applied again', async () => {
         TASK_HOOKS['browser-detection'] = {
            onResult: async () => {
               throw new Error('account update failed')
            },
         }
         mocks.finishTask.mockImplementation(async (_result: unknown, after: (...args: unknown[]) => Promise<void>) => {
            await after({}, {})
         })

         await expect(TaskService.applyResult(result)).rejects.toThrow('account update failed')
      })

      it('should do nothing for a result that did not finish a session, such as a repeated one', async () => {
         const onResult = vi.fn()

         TASK_HOOKS['browser-detection'] = { onResult }
         mocks.finishTask.mockResolvedValue(null)

         await expect(TaskService.applyResult(result)).resolves.toBe(false)
         expect(onResult).not.toHaveBeenCalled()
      })

      it('should work for a task without a hook', async () => {
         delete TASK_HOOKS['browser-detection']
         mocks.finishTask.mockImplementation(async (_result: unknown, after: (...args: unknown[]) => Promise<void>) => {
            await after({}, {})

            return { id: result.task_id }
         })

         await expect(TaskService.applyResult(result)).resolves.toBe(true)
      })
   })
})
