import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { CryptoService, MessageBroker } from 'core'

import { PrismaService, SpiderSessionService, TASK_HOOKS, TaskService, UserService } from 'database'

import { taskResultSchema } from '@automatedLinkedIn/contracts'

import { ConsumerRunner } from './consumers/consumerRunner'
import { deadDepths, deadQueueName } from './consumers/deadQueue'
import { defineConsumer } from './consumers/defineConsumer'
import { replayDead } from './consumers/replay'

// Needs PostgreSQL and RabbitMQ. The queue is the test's own, so a worker running on this machine takes nothing from it.
const QUEUE = `worker-test.${randomUUID()}`
const email = `${randomUUID()}@elitale.com`

const consumer = defineConsumer({
   name: 'test-results',
   queue: QUEUE,
   topology: async channel => {
      await channel.assertQueue(QUEUE, { durable: true })
   },
   parse: content => taskResultSchema.parse(JSON.parse(content)),
   label: result => result.task_id,
   handle: async result => {
      await TaskService.applyResult(result)
   },
   retry: {
      max: 2,
      backoffMs: [400],
   },
})

const finished = (taskId: string) => ({
   contract: 1 as const,
   task_id: taskId,
   task: 'linkedin-login',
   task_version: 1,
   status: 'SUCCEEDED' as const,
   verdict: 'VALID',
   message: 'Signed in to LinkedIn.',
   artifacts: [],
   artifacts_truncated: false,
   worker: { build: 'abc1234' },
   started_at: new Date().toISOString(),
   finished_at: new Date().toISOString(),
})

let userId: string
let accountId: string
let runner: ConsumerRunner

// A sign-in check that the account is waiting for.
const startCheck = async () => {
   const id = randomUUID()

   await SpiderSessionService.startTask({
      id,
      userId,
      linkedInAccountId: accountId,
      task: 'linkedin-login',
      taskVersion: 1,
      trigger: 'manual',
      input: {},
      startedAt: new Date(),
   })
   await PrismaService.client.linkedInAccount.update({
      where: { id: accountId },
      data: {
         status: 'PENDING',
         validationId: id,
      },
   })

   return id
}

const publish = async (body: unknown) => {
   const channel = await MessageBroker.confirmChannel()

   channel.sendToQueue(QUEUE, Buffer.from(JSON.stringify(body)), { persistent: true })
   await channel.waitForConfirms()
}

const account = () => PrismaService.client.linkedInAccount.findUniqueOrThrow({ where: { id: accountId } })

const session = (id: string) => PrismaService.client.spiderSession.findUniqueOrThrow({ where: { id } })

describe('the brain worker (PostgreSQL and RabbitMQ)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id

      const sealed = CryptoService.seal('{"password":"hunter2"}')

      accountId = (
         await PrismaService.client.linkedInAccount.create({
            data: {
               userId,
               email: 'ada@work.com',
               secret: sealed.ciphertext,
               secretIv: sealed.iv,
               secretTag: sealed.tag,
            },
         })
      ).id

      runner = new ConsumerRunner(consumer, {
         openChannel: () => MessageBroker.confirmedChannel(),
         log: {
            info: () => undefined,
            error: () => undefined,
         },
         reconnectMs: 200,
      })
      await runner.start()
   })

   afterAll(async () => {
      await runner.stop(1000)

      const channel = await MessageBroker.channel()

      await channel.deleteQueue(QUEUE)
      await channel.deleteQueue(deadQueueName(QUEUE))
      await channel.close()
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
      await MessageBroker.disconnect()
   })

   it('should apply a result from the queue: finish the session and update the account', async () => {
      const taskId = await startCheck()

      await publish(finished(taskId))

      await expect.poll(async () => (await session(taskId)).status, { timeout: 10_000 }).toBe('SUCCEEDED')
      await expect(account()).resolves.toMatchObject({
         status: 'ACTIVE',
         validationId: null,
      })
   })

   it('should leave the session in progress when the task hook fails, and apply the whole result on the retry', async () => {
      const taskId = await startCheck()
      const hook = TASK_HOOKS['linkedin-login']

      if (!hook) {
         throw new Error('The linkedin-login hook is missing')
      }

      const failing = vi.spyOn(hook, 'onResult').mockRejectedValueOnce(new Error('account update failed'))

      await publish(finished(taskId))
      await expect.poll(() => runner.state().failed, { timeout: 10_000 }).toBeGreaterThanOrEqual(1)

      // The first attempt rolled back: neither the session nor the account moved.
      await expect(session(taskId)).resolves.toMatchObject({ status: 'IN_PROGRESS' })
      await expect(account()).resolves.toMatchObject({ status: 'PENDING' })

      await expect.poll(async () => (await session(taskId)).status, { timeout: 10_000 }).toBe('SUCCEEDED')
      await expect(account()).resolves.toMatchObject({ status: 'ACTIVE' })
      expect(failing).toHaveBeenCalledTimes(2)
      failing.mockRestore()
   })

   it('should keep a message that does not match the contract in the dead queue, and move it back on replay', async () => {
      await publish({ nope: 1 })
      const waiting = async () => (await deadDepths([QUEUE], () => MessageBroker.confirmedChannel()))[0].messages

      await expect.poll(waiting, { timeout: 10_000 }).toBe(1)

      await runner.stop(1000)

      const channel = await MessageBroker.confirmedChannel()

      await expect(replayDead(channel, consumer)).resolves.toBe(1)

      await expect(channel.checkQueue(QUEUE)).resolves.toMatchObject({ messageCount: 1 })
      await expect(channel.checkQueue(deadQueueName(QUEUE))).resolves.toMatchObject({ messageCount: 0 })
      await channel.purgeQueue(QUEUE)
      await channel.close()
   })
})
