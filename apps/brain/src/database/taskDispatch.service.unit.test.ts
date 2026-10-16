import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type TaskCatalogEntry } from '@automatedLinkedIn/contracts'

import { TaskDispatchService } from './taskDispatch.service'

const mocks = vi.hoisted(() => ({
   publish: vi.fn(),
   queryRaw: vi.fn(),
   executeRaw: vi.fn(),
   findSession: vi.fn(),
   findAccount: vi.fn(),
   deleteDispatch: vi.fn(),
   pickForAccount: vi.fn(),
   fail: vi.fn(),
   readCatalog: vi.fn(),
   applyTaskResult: vi.fn(),
}))

vi.mock('core', () => ({ TaskQueue: { publish: mocks.publish } }))

vi.mock('./prisma.service', () => ({
   PrismaService: {
      client: {
         $queryRawUnsafe: mocks.queryRaw,
         $executeRawUnsafe: mocks.executeRaw,
         spiderSession: { findUnique: mocks.findSession },
         linkedInAccount: { findUnique: mocks.findAccount },
         taskDispatch: { deleteMany: mocks.deleteDispatch },
      },
   },
}))

vi.mock('./proxyServer.service', () => ({ ProxyServerService: { pickForAccount: mocks.pickForAccount } }))
vi.mock('./spiderSession.service', () => ({ SpiderSessionService: { fail: mocks.fail } }))
vi.mock('./taskCatalog', () => ({ readCatalog: mocks.readCatalog }))
vi.mock('./taskResult', () => ({ applyTaskResult: mocks.applyTaskResult }))

const SESSION_ID = '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11'
const STARTED_AT = new Date('2026-10-16T10:00:00.123Z')

const entry = (
   needs: TaskCatalogEntry['needs'] = {
      proxy: 'required',
      account: false,
   }
): TaskCatalogEntry => ({
   contract: 1,
   task: 'browser-detection',
   version: 1,
   title: 'Browser test',
   description: 'Checks the browser.',
   input_schema: { type: 'object' },
   needs,
   verdicts: {},
   policy: {
      cooldown_ms: 0,
      one_at_a_time: 'proxy',
   },
   hosts: [],
})

const session = (overrides: Record<string, unknown> = {}) => ({
   id: SESSION_ID,
   userId: 'u1',
   linkedInAccountId: 'acc1',
   task: 'browser-detection',
   taskVersion: 1,
   trigger: 'manual',
   status: 'IN_PROGRESS',
   startedAt: STARTED_AT,
   requestParams: {
      action: 'TASK',
      input: { word: 'hello' },
      proxy: 'http://proxy.example.net:8080',
   },
   proxyServerId: 'p1',
   ...overrides,
})

const claimed = (overrides: Record<string, number> = {}) => [
   {
      attempts: 0,
      giveUpFailures: 0,
      ageMs: 1000,
      ...overrides,
   },
]

const picked = { config: { server: 'http://proxy.example.net:8080' } }

describe('TaskDispatchService', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      vi.spyOn(console, 'log').mockImplementation(() => undefined)
      mocks.queryRaw.mockResolvedValue(claimed())
      mocks.findSession.mockResolvedValue(session())
      mocks.readCatalog.mockResolvedValue([entry()])
      mocks.pickForAccount.mockResolvedValue(picked)
      mocks.publish.mockResolvedValue(undefined)
      mocks.deleteDispatch.mockResolvedValue({ count: 1 })
      mocks.executeRaw.mockResolvedValue(1)
      mocks.applyTaskResult.mockResolvedValue(true)
      mocks.fail.mockResolvedValue(undefined)
   })

   afterEach(() => {
      vi.useRealTimers()
   })

   describe('dispatch', () => {
      it('should publish the command built from what is stored, then delete the row', async () => {
         await expect(TaskDispatchService.dispatch(SESSION_ID)).resolves.toEqual({ outcome: 'published' })

         expect(mocks.pickForAccount).toHaveBeenCalledWith('acc1', 'p1')
         expect(mocks.publish).toHaveBeenCalledWith({
            contract: 1,
            task_id: SESSION_ID,
            user_id: 'u1',
            task: 'browser-detection',
            task_version: 1,
            // The folder of the run is computed from this, so it must be the session's own time to the millisecond.
            requested_at: '2026-10-16T10:00:00.123Z',
            trigger: 'manual',
            proxy: picked.config,
            input: { word: 'hello' },
         })
         expect(mocks.deleteDispatch).toHaveBeenCalledWith({ where: { sessionId: SESSION_ID } })
         expect(mocks.publish.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.deleteDispatch.mock.invocationCallOrder[0]
         )
      })

      it('should do nothing for a row another publisher holds', async () => {
         mocks.queryRaw.mockResolvedValue([])

         await expect(TaskDispatchService.dispatch(SESSION_ID)).resolves.toEqual({ outcome: 'busy' })
         expect(mocks.publish).not.toHaveBeenCalled()
      })

      it.each([
         ['already answered', session({ status: 'SUCCEEDED' })],
         ['gone', null],
      ])('should publish nothing and delete the row when the session is %s', async (_name, found) => {
         mocks.findSession.mockResolvedValue(found)

         await expect(TaskDispatchService.dispatch(SESSION_ID)).resolves.toEqual({ outcome: 'skipped' })
         expect(mocks.publish).not.toHaveBeenCalled()
         expect(mocks.deleteDispatch).toHaveBeenCalledTimes(1)
      })

      it('should send the sealed credentials of the account to a task that needs it', async () => {
         mocks.readCatalog.mockResolvedValue([
            entry({
               proxy: 'required',
               account: true,
            }),
         ])
         mocks.findAccount.mockResolvedValue({
            email: 'ada@work.com',
            status: 'PENDING',
            secret: 'Y2lwaGVy',
            secretIv: 'aXY=',
            secretTag: 'dGFn',
            keyVersion: 1,
         })

         await TaskDispatchService.dispatch(SESSION_ID)

         expect(mocks.publish).toHaveBeenCalledWith(
            expect.objectContaining({
               account_id: 'acc1',
               account_email: 'ada@work.com',
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
         await TaskDispatchService.dispatch(SESSION_ID)

         expect(mocks.findAccount).not.toHaveBeenCalled()
         expect(mocks.publish.mock.calls[0][0]).not.toHaveProperty('credentials')
         expect(mocks.publish.mock.calls[0][0]).not.toHaveProperty('account_id')
      })

      it('should publish a task that never had a proxy without one', async () => {
         mocks.readCatalog.mockResolvedValue([
            entry({
               proxy: 'optional',
               account: false,
            }),
         ])
         mocks.findSession.mockResolvedValue(
            session({
               proxyServerId: null,
               requestParams: {
                  action: 'TASK',
                  input: {},
                  proxy: null,
               },
            })
         )

         await expect(TaskDispatchService.dispatch(SESSION_ID)).resolves.toEqual({ outcome: 'published' })
         expect(mocks.pickForAccount).not.toHaveBeenCalled()
         expect(mocks.publish.mock.calls[0][0]).not.toHaveProperty('proxy')
      })

      describe('when the broker does not take it', () => {
         it('should keep the row, count the attempt, and wait before trying again', async () => {
            mocks.publish.mockRejectedValue(new Error('nack from broker'))

            await expect(TaskDispatchService.dispatch(SESSION_ID)).resolves.toEqual({
               outcome: 'retry',
               transport: true,
            })

            expect(mocks.deleteDispatch).not.toHaveBeenCalled()
            expect(mocks.executeRaw).toHaveBeenCalledWith(
               expect.stringContaining('"attempts" = "attempts" + 1'),
               SESSION_ID,
               10_000,
               'The broker could not be reached or refused the task'
            )
         })

         it('should store a fixed sentence, never the text of the broker error', async () => {
            mocks.publish.mockRejectedValue(new Error('amqp://user:hunter2@host refused'))

            await TaskDispatchService.dispatch(SESSION_ID)

            expect(JSON.stringify(mocks.executeRaw.mock.calls)).not.toContain('hunter2')
            expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('hunter2')
         })

         it('should wait longer after each failure, up to the longest wait', async () => {
            mocks.publish.mockRejectedValue(new Error('x'))

            const delays: number[] = []

            for (const attempts of [1, 2, 3, 9]) {
               mocks.queryRaw.mockResolvedValue(claimed({ attempts }))
               await TaskDispatchService.dispatch(SESSION_ID)
               delays.push(mocks.executeRaw.mock.calls.at(-1)?.[2])
            }

            expect(delays).toEqual([30_000, 120_000, 300_000, 300_000])
         })

         it('should write a line for the first failure only, not for every retry', async () => {
            mocks.publish.mockRejectedValue(new Error('x'))

            await TaskDispatchService.dispatch(SESSION_ID)
            mocks.queryRaw.mockResolvedValue(claimed({ attempts: 1 }))
            await TaskDispatchService.dispatch(SESSION_ID)

            expect(console.error).toHaveBeenCalledTimes(1)
         })

         it('should say when it published after failures', async () => {
            mocks.queryRaw.mockResolvedValue(claimed({ attempts: 2 }))

            await TaskDispatchService.dispatch(SESSION_ID)

            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('after 2 failed attempt'))
         })

         it('should not wait for a broker that never confirms: it times out after 5 seconds', async () => {
            vi.useFakeTimers()
            mocks.publish.mockReturnValue(new Promise(() => undefined))

            const result = TaskDispatchService.dispatch(SESSION_ID)

            await vi.advanceTimersByTimeAsync(5000)

            await expect(result).resolves.toEqual({
               outcome: 'retry',
               transport: true,
            })
            expect(mocks.executeRaw).toHaveBeenCalledWith(
               expect.any(String),
               SESSION_ID,
               10_000,
               'The broker did not confirm in time'
            )
         })
      })

      describe('when the task can never run', () => {
         const gaveUpWith = () => mocks.applyTaskResult.mock.calls[0][0]

         it('should end the session as not queued once it waited 15 minutes, and publish nothing', async () => {
            mocks.queryRaw.mockResolvedValue(claimed({ ageMs: 15 * 60 * 1000 }))

            await expect(TaskDispatchService.dispatch(SESSION_ID)).resolves.toEqual({ outcome: 'gave-up' })

            expect(mocks.publish).not.toHaveBeenCalled()
            expect(gaveUpWith()).toMatchObject({
               task_id: SESSION_ID,
               task: 'browser-detection',
               status: 'FAILED',
               verdict: 'NOT_QUEUED',
               worker: { build: 'brain' },
               started_at: '2026-10-16T10:00:00.123Z',
               artifacts: [],
            })
            expect(mocks.deleteDispatch).toHaveBeenCalledTimes(1)
         })

         it('should still publish a task that waited 14 minutes', async () => {
            mocks.queryRaw.mockResolvedValue(claimed({ ageMs: 14 * 60 * 1000 }))

            await expect(TaskDispatchService.dispatch(SESSION_ID)).resolves.toEqual({ outcome: 'published' })
         })

         it('should cancel a task whose account was paused while it waited', async () => {
            mocks.readCatalog.mockResolvedValue([
               entry({
                  proxy: 'required',
                  account: true,
               }),
            ])
            mocks.findAccount.mockResolvedValue({
               email: 'ada@work.com',
               status: 'DISABLED',
               secret: 'x',
               secretIv: 'x',
               secretTag: 'x',
               keyVersion: 1,
            })

            await expect(TaskDispatchService.dispatch(SESSION_ID)).resolves.toEqual({ outcome: 'gave-up' })

            expect(mocks.publish).not.toHaveBeenCalled()
            expect(gaveUpWith()).toMatchObject({ verdict: 'CANCELLED' })
         })

         it('should give up when the proxy of the task was removed, never run without it', async () => {
            mocks.findSession.mockResolvedValue(session({ proxyServerId: null }))

            await TaskDispatchService.dispatch(SESSION_ID)

            expect(mocks.publish).not.toHaveBeenCalled()
            expect(gaveUpWith()).toMatchObject({ verdict: 'NEEDS_PROXY' })
         })

         it('should not fall back to a direct connection for a task that needs a proxy and was saved without one', async () => {
            mocks.findSession.mockResolvedValue(
               session({
                  proxyServerId: null,
                  requestParams: {
                     action: 'TASK',
                     input: {},
                     proxy: null,
                  },
               })
            )

            await TaskDispatchService.dispatch(SESSION_ID)

            expect(mocks.publish).not.toHaveBeenCalled()
            expect(gaveUpWith()).toMatchObject({ verdict: 'NEEDS_PROXY' })
         })

         it('should keep waiting while the proxy exists but is not usable right now, since it may recover', async () => {
            mocks.pickForAccount.mockResolvedValue(null)

            await expect(TaskDispatchService.dispatch(SESSION_ID)).resolves.toEqual({
               outcome: 'retry',
               transport: false,
            })

            expect(mocks.applyTaskResult).not.toHaveBeenCalled()
            expect(mocks.executeRaw).toHaveBeenCalledWith(
               expect.any(String),
               SESSION_ID,
               10_000,
               'The proxy is not usable right now'
            )
         })

         it('should give up on a task the worker no longer announces', async () => {
            mocks.readCatalog.mockResolvedValue([])

            await TaskDispatchService.dispatch(SESSION_ID)

            expect(gaveUpWith()).toMatchObject({ verdict: 'UNKNOWN_TASK' })
         })

         it('should give up on a command that cannot be valid, instead of retrying it', async () => {
            mocks.findSession.mockResolvedValue(
               session({
                  requestParams: {
                     action: 'TASK',
                     input: { big: 'x'.repeat(9000) },
                     proxy: 'http://proxy.example.net:8080',
                  },
               })
            )

            await TaskDispatchService.dispatch(SESSION_ID)

            expect(mocks.publish).not.toHaveBeenCalled()
            expect(gaveUpWith()).toMatchObject({ verdict: 'NOT_QUEUED' })
         })

         it('should try the give-up again later when its hook fails, up to three times', async () => {
            mocks.applyTaskResult.mockRejectedValue(new Error('hook failed'))
            mocks.queryRaw.mockResolvedValue(claimed({ ageMs: 20 * 60 * 1000 }))

            await expect(TaskDispatchService.dispatch(SESSION_ID)).resolves.toEqual({ outcome: 'retry' })

            expect(mocks.fail).not.toHaveBeenCalled()
            expect(mocks.deleteDispatch).not.toHaveBeenCalled()
            expect(mocks.executeRaw).toHaveBeenCalledWith(
               expect.stringContaining('"giveUpFailures" = "giveUpFailures" + 1'),
               SESSION_ID,
               30_000
            )
         })

         it('should end the session without its hook after the third failed give-up, so it never stays in progress', async () => {
            mocks.applyTaskResult.mockRejectedValue(new Error('hook failed'))
            mocks.queryRaw.mockResolvedValue(
               claimed({
                  ageMs: 20 * 60 * 1000,
                  giveUpFailures: 2,
               })
            )

            await expect(TaskDispatchService.dispatch(SESSION_ID)).resolves.toEqual({ outcome: 'gave-up' })

            expect(mocks.fail).toHaveBeenCalledWith(SESSION_ID, expect.any(String), 'NOT_QUEUED')
            expect(mocks.deleteDispatch).toHaveBeenCalledTimes(1)
         })
      })
   })

   describe('dispatchDue', () => {
      const dueRows = (ids: string[]) => ids.map(sessionId => ({ sessionId }))

      it('should publish the rows that are due and count what happened', async () => {
         const dispatch = vi
            .spyOn(TaskDispatchService, 'dispatch')
            .mockResolvedValueOnce({ outcome: 'published' })
            .mockResolvedValueOnce({ outcome: 'gave-up' })
            .mockResolvedValueOnce({ outcome: 'retry' })

         mocks.queryRaw.mockResolvedValue(dueRows(['a', 'b', 'c']))

         await expect(TaskDispatchService.dispatchDue()).resolves.toEqual({
            published: 1,
            retried: 1,
            gaveUp: 1,
         })
         expect(dispatch.mock.calls.map(([id]) => id)).toEqual(['a', 'b', 'c'])

         dispatch.mockRestore()
      })

      it('should only take rows that are due, not leased, and old enough to leave the inline publish alone', async () => {
         mocks.queryRaw.mockResolvedValue([])

         await TaskDispatchService.dispatchDue()

         const [[sql]] = mocks.queryRaw.mock.calls

         expect(sql).toContain('"nextAttemptAt" <=')
         expect(sql).toContain('"claimedUntil" IS NULL OR "claimedUntil" <')
         expect(sql).toContain('"attempts" > 0 OR "createdAt" <=')
         expect(sql).toContain('ORDER BY "createdAt"')
         expect(sql).toContain('LIMIT 20')
      })

      it('should stop at the first broker that cannot be reached, since the others would fail the same way', async () => {
         const dispatch = vi
            .spyOn(TaskDispatchService, 'dispatch')
            .mockResolvedValueOnce({
               outcome: 'retry',
               transport: true,
            })
            .mockResolvedValue({ outcome: 'published' })

         mocks.queryRaw.mockResolvedValue(dueRows(['a', 'b', 'c']))

         await expect(TaskDispatchService.dispatchDue()).resolves.toMatchObject({ retried: 1 })
         expect(dispatch).toHaveBeenCalledTimes(1)

         dispatch.mockRestore()
      })

      it('should not let one row that cannot be handled stop the others', async () => {
         const dispatch = vi
            .spyOn(TaskDispatchService, 'dispatch')
            .mockRejectedValueOnce(new Error('database down'))
            .mockResolvedValue({ outcome: 'published' })

         mocks.queryRaw.mockResolvedValue(dueRows(['a', 'b']))

         await expect(TaskDispatchService.dispatchDue()).resolves.toMatchObject({ published: 1 })

         dispatch.mockRestore()
      })

      it('should stop when the job runs out of time', async () => {
         const controller = new AbortController()
         const dispatch = vi.spyOn(TaskDispatchService, 'dispatch').mockImplementation(async () => {
            controller.abort()

            return { outcome: 'published' }
         })

         mocks.queryRaw.mockResolvedValue(dueRows(['a', 'b', 'c']))

         await TaskDispatchService.dispatchDue(controller.signal)

         expect(dispatch).toHaveBeenCalledTimes(1)

         dispatch.mockRestore()
      })
   })

   describe('waiting', () => {
      it('should count the rows and the age of the oldest', async () => {
         mocks.queryRaw.mockResolvedValue([
            {
               waiting: 3,
               oldestSeconds: 41.6,
            },
         ])

         await expect(TaskDispatchService.waiting()).resolves.toEqual({
            waiting: 3,
            oldestSeconds: 42,
         })
      })

      it('should say zero for an empty table', async () => {
         mocks.queryRaw.mockResolvedValue([
            {
               waiting: 0,
               oldestSeconds: null,
            },
         ])

         await expect(TaskDispatchService.waiting()).resolves.toEqual({
            waiting: 0,
            oldestSeconds: 0,
         })
      })
   })
})
