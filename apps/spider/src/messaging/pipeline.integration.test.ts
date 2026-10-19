import { type Channel, type GetMessage } from 'amqplib'
import { createCipheriv, randomBytes, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import {
   TASK_DEAD_QUEUE as RUN_DEAD_QUEUE,
   TASK_DONE_QUEUE as RUN_DONE_QUEUE,
   TASK_KEY as RUN_KEY,
   TASK_QUEUE as RUN_QUEUE,
   type TaskCommand,
   type TaskResult,
   taskCommandSchema,
} from '@automatedLinkedIn/contracts'

import { type ScrapeTaskCommand, type ScrapeTaskResult } from '../types'

import { RABBITMQ_URL } from '../env'
import { AccountBusyError, TaskError } from '../scraping/errors'
import { processTask } from '../scraping/processTask'
import { openCredentials } from '../tasks/credentials'
import { defineTask } from '../tasks/defineTask'
import { exhaustedResult, runTask } from '../tasks/runner'
import { Broker } from './broker'
import { MAX_RETRIES, type TaskHandler, consumeQueue, consumeTasks } from './consumer'
import { publishResult, publishRunResult, publishTask, republishRun, republishTask } from './publisher'
import { DEAD_QUEUE, EXCHANGE, RESULT_QUEUE, TASK_KEY, TASK_QUEUE, assertTopology } from './topology'

// Needs a RabbitMQ at RABBITMQ_URL. It purges the spider queues first, so run it against a scratch broker
// with no worker running (CI's service container, or `docker compose up rabbitmq` on its own).

const broker = new Broker(RABBITMQ_URL)

let channel: Channel

const command = (): ScrapeTaskCommand => ({
   task_id: randomUUID(),
   task_type: 'integration',
   timestamp: new Date().toISOString(),
   auth_session_key: '',
   target_url: 'http://localhost:8080/',
   actions: [
      {
         step: 1,
         action: 'navigate',
         params: {},
      },
   ],
})

// Retries wait a few milliseconds here instead of the production back-off.
const consume = async (handler: TaskHandler) =>
   consumeTasks(await broker.consumeChannel(), handler, {
      republish: async (message, retries) => republishTask(await broker.publishChannel(), message, retries),
      backoffMs: [20, 20, 20],
      busyDelayMs: 20,
      log: {
         info: () => undefined,
         error: () => undefined,
      },
   })

const freeAccount = { acquire: async () => ({ release: async () => undefined }) }

const next = async (queue: string, match: (message: GetMessage) => boolean, timeoutMs = 15_000) => {
   const deadline = Date.now() + timeoutMs

   while (Date.now() < deadline) {
      const message = await channel.get(queue, { noAck: false })

      if (message && match(message)) {
         channel.ack(message)

         return message
      }

      if (message) {
         channel.nack(message, false, true)
      }

      await new Promise(resolve => setTimeout(resolve, 200))
   }

   throw new Error(`Nothing arrived in ${queue}`)
}

beforeAll(async () => {
   channel = await broker.consumeChannel()
   await assertTopology(channel)

   for (const queue of [TASK_QUEUE, DEAD_QUEUE, RESULT_QUEUE, RUN_QUEUE, RUN_DEAD_QUEUE, RUN_DONE_QUEUE]) {
      await channel.purgeQueue(queue)
   }
})

afterAll(async () => {
   await broker.close()
})

const CRED_KEY = Buffer.alloc(32, 5).toString('base64')

// Sealed the way brain seals the credentials it stores.
const sealed = (bundle: object) => {
   const iv = randomBytes(12)
   const cipher = createCipheriv('aes-256-gcm', Buffer.from(CRED_KEY, 'base64'), iv)
   const ciphertext = Buffer.concat([cipher.update(JSON.stringify(bundle), 'utf8'), cipher.final()])

   return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      key_version: 1,
   }
}

const runCommand = (bundle: object = { password: 'hunter2' }): TaskCommand => ({
   contract: 1,
   task_id: randomUUID(),
   user_id: 'user-integration',
   task: 'demo-login',
   task_version: 1,
   requested_at: new Date().toISOString(),
   trigger: 'manual',
   proxy: { server: 'http://proxy.example.net:8080' },
   account_id: 'acc-integration',
   account_email: 'ada@work.com',
   credentials: sealed(bundle),
   input: {},
})

const sendRun = async (item: TaskCommand) => {
   const publisher = await broker.publishChannel()

   publisher.publish('scraping.exchange', RUN_KEY, Buffer.from(JSON.stringify(item)), {
      persistent: true,
      messageId: item.task_id,
   })
   await publisher.waitForConfirms()
}

const consumeRuns = async (handler: (item: TaskCommand) => Promise<void>) =>
   consumeQueue(
      await broker.consumeChannel(),
      {
         queue: RUN_QUEUE,
         parse: content => taskCommandSchema.parse(JSON.parse(content.toString())),
         label: item => `Task ${item.task} ${item.task_id}`,
         handler,
         onExhausted: async item => publishRunResult(await broker.publishChannel(), exhaustedResult(item, 'test')),
      },
      {
         republish: async (message, retries) => republishRun(await broker.publishChannel(), message, retries),
         backoffMs: [20, 20, 20],
         busyDelayMs: 20,
         log: {
            info: () => undefined,
            error: () => undefined,
         },
      }
   )

describe('the task contract on a real RabbitMQ', () => {
   it('should carry a command from brain to the worker, open the sealed credentials, and answer on the results queue', async () => {
      const seen = vi.fn()
      const demo = defineTask({
         name: 'demo-login',
         version: 1,
         title: 'Demo',
         description: 'Only for this test.',
         input: z.strictObject({}),
         needs: {
            proxy: 'required',
            account: true,
         },
         hosts: ['example.com'],
         verdicts: {
            VALID: {
               label: 'Signed in',
               tone: 'success',
            },
         },
         policy: {
            cooldownMs: 0,
            oneAtATime: 'account',
         },
         limits: { timeoutMs: 5000 },
         run: async ({ account }) => {
            seen(account?.credentials)

            return {
               status: 'SUCCEEDED',
               verdict: 'VALID',
               message: 'Signed in.',
            }
         },
      })
      const item = runCommand({
         password: 'hunter2',
         totpSecret: 'JBSWY3DPEHPK3PXP',
      })
      const consumer = await consumeRuns(command =>
         runTask(command, {
            tasks: [demo],
            driver: {
               open: async () =>
                  ({
                     close: async () => undefined,
                     storageState: async () => ({
                        cookies: [],
                        origins: [],
                     }),
                  }) as never,
            },
            policy: {
               allowsUrl: () => true,
               allowsCookieDomain: () => true,
               exemptsRobots: () => false,
            },
            robots: { check: async () => ({ allowed: true }) },
            limiter: { wait: async () => undefined },
            store: { put: async () => undefined },
            accountLock: freeAccount,
            openCredentials: bundle => openCredentials(bundle, CRED_KEY),
            startRecording: async () => undefined,
            publishResult: async result => publishRunResult(await broker.publishChannel(), result),
            workerBuild: 'test',
         })
      )

      await sendRun(item)

      const message = await next(RUN_DONE_QUEUE, ({ properties }) => properties.messageId === item.task_id)

      await consumer.stop()

      expect(JSON.parse(message.content.toString())).toMatchObject({
         task_id: item.task_id,
         task: 'demo-login',
         status: 'SUCCEEDED',
         verdict: 'VALID',
      })
      expect(seen).toHaveBeenCalledWith({
         password: 'hunter2',
         totpSecret: 'JBSWY3DPEHPK3PXP',
      })
      expect(message.content.toString()).not.toContain('hunter2')
      expect(message.properties.deliveryMode).toBe(2)
   })

   it('should answer CRASHED after the retries are used up, instead of dead-lettering, so a session is never left waiting', async () => {
      const item = runCommand()
      let attempts = 0
      const consumer = await consumeRuns(async () => {
         attempts += 1

         throw new Error('browser crashed')
      })

      await sendRun(item)

      const message = await next(RUN_DONE_QUEUE, ({ properties }) => properties.messageId === item.task_id)

      await consumer.stop()

      expect(JSON.parse(message.content.toString()) as TaskResult).toMatchObject({
         task_id: item.task_id,
         status: 'FAILED',
         verdict: 'CRASHED',
      })
      expect(attempts).toBe(MAX_RETRIES + 1)
      expect(await channel.get(RUN_DEAD_QUEUE, { noAck: true })).toBe(false)
   })

   it('should dead-letter a command that does not match the contract, without a result', async () => {
      const id = randomUUID()
      const consumer = await consumeRuns(async () => undefined)
      const publisher = await broker.publishChannel()

      publisher.publish('scraping.exchange', RUN_KEY, Buffer.from('{"not":"a command"}'), {
         persistent: true,
         messageId: id,
      })
      await publisher.waitForConfirms()

      await next(RUN_DEAD_QUEUE, ({ properties }) => properties.messageId === id)
      await consumer.stop()
   })
})

describe('task pipeline on a real RabbitMQ', () => {
   it('should carry a task from the API side to the worker and a result back, acknowledging after both are done', async () => {
      const task = command()
      const stored: string[] = []
      const consumer = await consume(command =>
         processTask(command, {
            engine: {
               run: async () => ({
                  records: [
                     {
                        author: 'Ada',
                        text: 'Hi',
                     },
                  ],
                  cookies: [],
               }),
            },
            store: { put: async key => void stored.push(key) },
            accountLock: freeAccount,
            publishResult: async result => publishResult(await broker.publishChannel(), result),
         })
      )

      await publishTask(await broker.publishChannel(), task)

      const message = await next(RESULT_QUEUE, ({ properties }) => properties.messageId === task.task_id)
      const result = JSON.parse(message.content.toString()) as ScrapeTaskResult

      await consumer.stop()

      expect(result).toMatchObject({
         task_id: task.task_id,
         status: 'SUCCESS',
         result_storage_path: `results/integration/${task.task_id}.json`,
         error: null,
      })
      expect(stored).toEqual([`results/integration/${task.task_id}.json`])
      expect(message.properties.deliveryMode).toBe(2)
   })

   it('should report a task failure as a FAILED result and not retry it', async () => {
      const task = command()
      let runs = 0
      const consumer = await consume(command =>
         processTask(command, {
            engine: {
               run: async () => {
                  runs += 1

                  throw new TaskError('robots.txt for localhost does not allow /x')
               },
            },
            store: { put: async () => undefined },
            accountLock: freeAccount,
            publishResult: async result => publishResult(await broker.publishChannel(), result),
         })
      )

      await publishTask(await broker.publishChannel(), task)

      const message = await next(RESULT_QUEUE, ({ properties }) => properties.messageId === task.task_id)

      await consumer.stop()

      expect(JSON.parse(message.content.toString())).toMatchObject({
         status: 'FAILED',
         result_storage_path: null,
         error: expect.stringContaining('robots.txt'),
      })
      expect(runs).toBe(1)
   })

   it('should wait and run a task again, without using a retry, while another task holds its account', async () => {
      const task = {
         ...command(),
         account_id: 'acc-integration',
      }
      let tries = 0
      const consumer = await consume(async received => {
         tries += 1

         if (tries < 3) {
            throw new AccountBusyError()
         }

         await processTask(received, {
            engine: {
               run: async () => ({
                  records: [],
                  cookies: [],
               }),
            },
            store: { put: async () => undefined },
            accountLock: freeAccount,
            publishResult: async result => publishResult(await broker.publishChannel(), result),
         })
      })

      await publishTask(await broker.publishChannel(), task)

      const message = await next(RESULT_QUEUE, ({ properties }) => properties.messageId === task.task_id)

      await consumer.stop()

      expect(JSON.parse(message.content.toString())).toMatchObject({ status: 'SUCCESS' })
      // Two busy answers and one run: more than MAX_RETRIES busy answers would still not dead-letter it.
      expect(tries).toBe(3)
   })

   it('should retry a failing task a bounded number of times, then dead-letter it', async () => {
      const task = command()
      let attempts = 0
      const consumer = await consume(async () => {
         attempts += 1

         throw new Error('storage unavailable')
      })

      await publishTask(await broker.publishChannel(), task)

      await next(DEAD_QUEUE, ({ properties }) => properties.messageId === task.task_id)
      await consumer.stop()

      // The first delivery plus MAX_RETRIES retries, then the dead-letter queue. Never a spin.
      expect(attempts).toBe(MAX_RETRIES + 1)
   })

   it('should dead-letter a message that is not a valid command straight away', async () => {
      const id = randomUUID()
      const consumer = await consume(async () => undefined)
      const publisher = await broker.publishChannel()

      publisher.publish(EXCHANGE, TASK_KEY, Buffer.from('{"not":"a command"}'), {
         persistent: true,
         messageId: id,
      })
      await publisher.waitForConfirms()

      await next(DEAD_QUEUE, ({ properties }) => properties.messageId === id)
      await consumer.stop()
   })
})
