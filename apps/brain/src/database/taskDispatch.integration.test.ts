import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { CryptoService } from 'core'

import { type TaskCatalogEntry } from '@automatedLinkedIn/contracts'

import { PrismaService } from './prisma.service'
import { SpiderSessionService } from './spiderSession.service'
import { TaskService } from './task.service'
import { TaskDispatchService } from './taskDispatch.service'
import { TASK_HOOKS } from './taskHooks'
import { UserService } from './user.service'

// Needs PostgreSQL. RabbitMQ is replaced so a broker that refuses a task can be made to happen on purpose.
const mocks = vi.hoisted(() => ({ publish: vi.fn() }))

vi.mock('core', async () => ({
   ...(await vi.importActual<Record<string, unknown>>('core')),
   TaskQueue: { publish: mocks.publish },
}))

const email = `${randomUUID()}@elitale.com`
const MINUTE_MS = 60 * 1000

const entry = (task: string, needsAccount: boolean): TaskCatalogEntry => ({
   contract: 1,
   task,
   version: 1,
   title: task,
   description: 'Only for this test.',
   input_schema: { type: 'object' },
   needs: {
      proxy: 'required',
      account: needsAccount,
   },
   verdicts: {},
   policy: {
      cooldown_ms: 0,
      one_at_a_time: 'none',
   },
   hosts: [],
})

let userId: string
let accountId: string
let proxyId: string

const startRow = async ({
   task = 'browser-detection',
   ageMs = 0,
   status,
   attempts = 0,
}: { task?: string; ageMs?: number; status?: 'SUCCEEDED'; attempts?: number } = {}) => {
   const id = randomUUID()
   const startedAt = new Date()

   await SpiderSessionService.startTask({
      id,
      userId,
      linkedInAccountId: accountId,
      task,
      taskVersion: 1,
      trigger: 'manual',
      input: { word: 'hello' },
      startedAt,
      proxy: {
         id: proxyId,
         protocol: 'HTTP',
         host: '203.0.113.9',
         port: 8080,
         country: 'Canada',
      },
   })
   await PrismaService.client.taskDispatch.create({
      data: {
         sessionId: id,
         createdAt: new Date(Date.now() - ageMs),
         // A second in the past: "due" is read on the database clock, which can lag this process by a few ms.
         nextAttemptAt: new Date(Date.now() - 1000),
         attempts,
      },
   })

   if (status) {
      await PrismaService.client.spiderSession.update({
         where: { id },
         data: {
            status,
            finishedAt: new Date(),
         },
      })
   }

   return {
      id,
      startedAt,
   }
}

const row = (id: string) => PrismaService.client.taskDispatch.findUnique({ where: { sessionId: id } })
const session = (id: string) => PrismaService.client.spiderSession.findUniqueOrThrow({ where: { id } })
const account = () => PrismaService.client.linkedInAccount.findUniqueOrThrow({ where: { id: accountId } })

// The policy of the task allows one run at a time, so what earlier tests left in progress must be over first.
const finishEarlierSessions = () =>
   PrismaService.client.spiderSession.updateMany({
      where: {
         userId,
         status: 'IN_PROGRESS',
      },
      data: {
         status: 'SUCCEEDED',
         finishedAt: new Date(),
      },
   })

describe('the task outbox (PostgreSQL)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id

      const sealed = CryptoService.seal('{"password":"hunter2"}')
      const secret = {
         secret: sealed.ciphertext,
         secretIv: sealed.iv,
         secretTag: sealed.tag,
      }

      accountId = (
         await PrismaService.client.linkedInAccount.create({
            data: {
               userId,
               email: 'ada@work.com',
               ...secret,
            },
         })
      ).id
      proxyId = (
         await PrismaService.client.proxyServer.create({
            data: {
               linkedInAccountId: accountId,
               protocol: 'HTTP',
               host: '203.0.113.9',
               port: 8080,
               ...secret,
               status: 'ACTIVE',
               isPrimary: true,
            },
         })
      ).id
      await TaskService.applyCatalog({
         contract: 1,
         announced_at: new Date().toISOString(),
         worker: { build: 'abc1234' },
         tasks: [entry('browser-detection', false), entry('linkedin-login', true)],
      })
   })

   beforeEach(() => {
      mocks.publish.mockReset()
      mocks.publish.mockResolvedValue(undefined)
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      vi.spyOn(console, 'log').mockImplementation(() => undefined)
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should save the session and publish at once, leaving no row behind', async () => {
      await finishEarlierSessions()

      const { id } = await TaskService.request({
         userId,
         task: 'browser-detection',
         proxyId,
         trigger: 'manual',
      })

      expect(mocks.publish).toHaveBeenCalledTimes(1)
      expect(mocks.publish.mock.calls[0][0]).toMatchObject({
         task_id: id,
         user_id: userId,
         task: 'browser-detection',
         proxy: expect.objectContaining({ server: expect.stringContaining('203.0.113.9') }),
      })
      await expect(session(id)).resolves.toMatchObject({ status: 'IN_PROGRESS' })
      await expect(row(id)).resolves.toBeNull()
   })

   it('should publish the time of the session to the millisecond, since brain checks the files against it', async () => {
      const { id, startedAt } = await startRow({ ageMs: 20_000 })

      await TaskDispatchService.dispatch(id)

      expect(mocks.publish.mock.calls[0][0].requested_at).toBe(startedAt.toISOString())
   })

   it('should accept the task when the broker refuses it, keep a row, and publish it when the job runs later', async () => {
      mocks.publish.mockRejectedValue(new Error('nack from broker'))

      await finishEarlierSessions()

      const { id } = await TaskService.request({
         userId,
         task: 'browser-detection',
         proxyId,
         trigger: 'manual',
      })

      await expect(session(id)).resolves.toMatchObject({ status: 'IN_PROGRESS' })
      await expect(row(id)).resolves.toMatchObject({
         attempts: 1,
         lastError: 'The broker could not be reached or refused the task',
      })

      // Not before its wait is over.
      await TaskDispatchService.dispatchDue()
      expect(mocks.publish).toHaveBeenCalledTimes(1)

      mocks.publish.mockResolvedValue(undefined)
      await PrismaService.client.taskDispatch.update({
         where: { sessionId: id },
         data: { nextAttemptAt: new Date(Date.now() - 1000) },
      })
      await TaskDispatchService.dispatchDue()

      expect(mocks.publish).toHaveBeenCalledTimes(2)
      await expect(row(id)).resolves.toBeNull()
   })

   it('should publish a task whose process stopped after it was saved, once it is old enough', async () => {
      const fresh = await startRow()
      const stale = await startRow({ ageMs: 20_000 })

      await TaskDispatchService.dispatchDue()

      expect(mocks.publish.mock.calls.map(([command]) => command.task_id)).toContain(stale.id)
      expect(mocks.publish.mock.calls.map(([command]) => command.task_id)).not.toContain(fresh.id)
      await expect(row(stale.id)).resolves.toBeNull()
      await expect(row(fresh.id)).resolves.not.toBeNull()
   })

   it('should let only one of two publishers take a row', async () => {
      const { id } = await startRow({ ageMs: 20_000 })

      mocks.publish.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)))

      const outcomes = await Promise.all([TaskDispatchService.dispatch(id), TaskDispatchService.dispatch(id)])

      expect(outcomes.map(({ outcome }) => outcome).sort()).toEqual(['busy', 'published'])
      expect(mocks.publish).toHaveBeenCalledTimes(1)
   })

   it('should publish nothing for a session that was answered meanwhile, and delete its row', async () => {
      const { id } = await startRow({
         ageMs: 20_000,
         status: 'SUCCEEDED',
      })

      await expect(TaskDispatchService.dispatch(id)).resolves.toEqual({ outcome: 'skipped' })
      expect(mocks.publish).not.toHaveBeenCalled()
      await expect(row(id)).resolves.toBeNull()
   })

   it('should end a task that waited 15 minutes as not queued, and put the account in error, not in need of new credentials', async () => {
      const { id } = await startRow({
         task: 'linkedin-login',
         ageMs: 16 * MINUTE_MS,
      })

      await PrismaService.client.linkedInAccount.update({
         where: { id: accountId },
         data: {
            status: 'PENDING',
            validationId: id,
         },
      })

      await expect(TaskDispatchService.dispatch(id)).resolves.toEqual({ outcome: 'gave-up' })

      expect(mocks.publish).not.toHaveBeenCalled()
      await expect(session(id)).resolves.toMatchObject({
         status: 'FAILED',
         verdict: 'NOT_QUEUED',
      })
      await expect(account()).resolves.toMatchObject({
         status: 'ERROR',
         validationId: null,
      })
      await expect(row(id)).resolves.toBeNull()
   })

   it('should cancel a sign-in for an account the owner paused while it waited', async () => {
      const { id } = await startRow({
         task: 'linkedin-login',
         ageMs: 20_000,
      })

      await PrismaService.client.linkedInAccount.update({
         where: { id: accountId },
         data: {
            status: 'DISABLED',
            validationId: id,
         },
      })

      await TaskDispatchService.dispatch(id)

      expect(mocks.publish).not.toHaveBeenCalled()
      await expect(session(id)).resolves.toMatchObject({
         status: 'FAILED',
         verdict: 'CANCELLED',
      })
      await expect(account()).resolves.toMatchObject({
         status: 'DISABLED',
         validationId: null,
      })
   })

   it('should save nothing at all when the hook of the task fails', async () => {
      const hook = TASK_HOOKS['linkedin-login']

      if (!hook) {
         throw new Error('The linkedin-login hook is missing')
      }

      await PrismaService.client.linkedInAccount.update({
         where: { id: accountId },
         data: { status: 'PENDING' },
      })
      await finishEarlierSessions()

      const before = await PrismaService.client.spiderSession.count({ where: { userId } })
      const failing = vi.spyOn(hook, 'onRequest').mockRejectedValueOnce(new Error('account update failed'))

      await expect(
         TaskService.request({
            userId,
            task: 'linkedin-login',
            accountId,
            proxyId,
            trigger: 'manual',
         })
      ).rejects.toThrow('account update failed')

      await expect(PrismaService.client.spiderSession.count({ where: { userId } })).resolves.toBe(before)
      expect(mocks.publish).not.toHaveBeenCalled()
      failing.mockRestore()
   })

   it('should refuse an input that can never be published and save nothing', async () => {
      await finishEarlierSessions()

      const before = await PrismaService.client.spiderSession.count({ where: { userId } })

      await expect(
         TaskService.request({
            userId,
            task: 'browser-detection',
            proxyId,
            trigger: 'manual',
            input: { big: 'x'.repeat(9000) },
         })
      ).rejects.toThrow('cannot be started')

      await expect(PrismaService.client.spiderSession.count({ where: { userId } })).resolves.toBe(before)
   })

   it('should count what waits and for how long', async () => {
      const { id } = await startRow({ ageMs: 90_000 })
      const { waiting, oldestSeconds } = await TaskDispatchService.waiting()

      expect(waiting).toBeGreaterThanOrEqual(1)
      expect(oldestSeconds).toBeGreaterThanOrEqual(90)

      await PrismaService.client.taskDispatch.delete({ where: { sessionId: id } })
   })
})
