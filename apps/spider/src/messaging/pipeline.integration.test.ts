import { type Channel, type GetMessage } from 'amqplib'
import { createCipheriv, randomBytes, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
   VALIDATED_QUEUE,
   VALIDATE_DEAD_QUEUE,
   VALIDATE_KEY,
   VALIDATE_QUEUE,
   type ValidateAccountCommand,
   type ValidateAccountResult,
   validateAccountCommandSchema,
} from '@automatedLinkedIn/contracts'

import { type ScrapeTaskCommand, type ScrapeTaskResult } from '../types'

import { RABBITMQ_URL } from '../env'
import { AccountBusyError, TaskError } from '../scraping/errors'
import { processTask } from '../scraping/processTask'
import { openCredentials } from '../validation/credentials'
import { processValidation } from '../validation/processValidation'
import { Broker } from './broker'
import { MAX_RETRIES, type TaskHandler, consumeQueue, consumeTasks } from './consumer'
import { publishResult, publishTask, publishValidationResult, republishTask, republishValidation } from './publisher'
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
      log: { error: () => undefined },
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

   for (const queue of [TASK_QUEUE, DEAD_QUEUE, RESULT_QUEUE, VALIDATE_QUEUE, VALIDATE_DEAD_QUEUE, VALIDATED_QUEUE]) {
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

const validation = (bundle: object = { password: 'hunter2' }): ValidateAccountCommand => ({
   validation_id: randomUUID(),
   account_id: 'acc-integration',
   email: 'ada@work.com',
   sealed: sealed(bundle),
   requested_at: new Date().toISOString(),
})

const sendValidation = async (command: ValidateAccountCommand) => {
   const publisher = await broker.publishChannel()

   publisher.publish('scraping.exchange', VALIDATE_KEY, Buffer.from(JSON.stringify(command)), {
      persistent: true,
      messageId: command.validation_id,
   })
   await publisher.waitForConfirms()
}

const consumeValidations = async (handler: (command: ValidateAccountCommand) => Promise<void>) =>
   consumeQueue(
      await broker.consumeChannel(),
      {
         queue: VALIDATE_QUEUE,
         parse: content => validateAccountCommandSchema.parse(JSON.parse(content.toString())),
         label: item => `Validation ${item.validation_id}`,
         handler,
         onExhausted: async item =>
            publishValidationResult(await broker.publishChannel(), {
               validation_id: item.validation_id,
               account_id: item.account_id,
               outcome: 'ERROR',
               message: 'Verification could not run. Try again later.',
               checked_at: new Date().toISOString(),
            }),
      },
      {
         republish: async (message, retries) => republishValidation(await broker.publishChannel(), message, retries),
         backoffMs: [20, 20, 20],
         busyDelayMs: 20,
         log: { error: () => undefined },
      }
   )

describe('account validation on a real RabbitMQ', () => {
   it('should carry a validation from brain to the worker, open the sealed credentials, and answer on the results queue', async () => {
      const task = validation({
         password: 'hunter2',
         totpSecret: 'JBSWY3DPEHPK3PXP',
      })
      const seen = vi.fn()
      const consumer = await consumeValidations(item =>
         processValidation(item, {
            driver: { open: async () => ({ close: async () => undefined }) as never },
            validator: {
               validate: async (_session, { credentials }) => {
                  seen(credentials)

                  return {
                     outcome: 'VALID',
                     cookies: [],
                  }
               },
            },
            store: { put: async () => undefined },
            accountLock: freeAccount,
            openCredentials: bundle => openCredentials(bundle, CRED_KEY),
            publishResult: async result => publishValidationResult(await broker.publishChannel(), result),
         })
      )

      await sendValidation(task)

      const message = await next(VALIDATED_QUEUE, ({ properties }) => properties.messageId === task.validation_id)

      await consumer.stop()

      expect(JSON.parse(message.content.toString())).toMatchObject({
         validation_id: task.validation_id,
         account_id: 'acc-integration',
         outcome: 'VALID',
      })
      expect(seen).toHaveBeenCalledWith({
         password: 'hunter2',
         totpSecret: 'JBSWY3DPEHPK3PXP',
      })
      expect(message.content.toString()).not.toContain('hunter2')
      expect(message.properties.deliveryMode).toBe(2)
   })

   it('should answer ERROR after the retries are used up, instead of dead-lettering, so the account is never left waiting', async () => {
      const task = validation()
      let attempts = 0
      const consumer = await consumeValidations(async () => {
         attempts += 1

         throw new Error('browser crashed')
      })

      await sendValidation(task)

      const message = await next(VALIDATED_QUEUE, ({ properties }) => properties.messageId === task.validation_id)

      await consumer.stop()

      expect(JSON.parse(message.content.toString()) as ValidateAccountResult).toMatchObject({
         validation_id: task.validation_id,
         outcome: 'ERROR',
      })
      expect(attempts).toBe(MAX_RETRIES + 1)
      expect(await channel.get(VALIDATE_DEAD_QUEUE, { noAck: true })).toBe(false)
   })

   it('should dead-letter a validation that does not match the contract, without a result', async () => {
      const id = randomUUID()
      const consumer = await consumeValidations(async () => undefined)
      const publisher = await broker.publishChannel()

      publisher.publish('scraping.exchange', VALIDATE_KEY, Buffer.from('{"not":"a validation"}'), {
         persistent: true,
         messageId: id,
      })
      await publisher.waitForConfirms()

      await next(VALIDATE_DEAD_QUEUE, ({ properties }) => properties.messageId === id)
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
