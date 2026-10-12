import { describe, expect, it, vi } from 'vitest'

import {
   TASK_KEY as RUN_KEY,
   TASK_CATALOG_KEY,
   TASK_DONE_KEY,
   type TaskCatalog,
   type TaskResult,
} from '@automatedLinkedIn/contracts'

import { type ScrapeTaskCommand, type ScrapeTaskResult } from '../types'

import { publishCatalog, publishResult, publishRunResult, publishTask, republishRun, republishTask } from './publisher'
import { EXCHANGE, RESULT_KEY, TASK_KEY } from './topology'

const channel = () => ({
   publish: vi.fn().mockReturnValue(true),
   waitForConfirms: vi.fn().mockResolvedValue(undefined),
})

const command = {
   task_id: 'task-1',
   task_type: 'demo',
} as ScrapeTaskCommand

const result = {
   task_id: 'task-1',
   task_type: 'demo',
   status: 'SUCCESS',
} as ScrapeTaskResult

describe('publisher', () => {
   it('should publish a task to the exchange with the task routing key, persistent, as json', async () => {
      const fake = channel()

      await publishTask(fake as never, command)

      const [[exchange, key, body, options]] = fake.publish.mock.calls

      expect(exchange).toBe(EXCHANGE)
      expect(key).toBe(TASK_KEY)
      expect(JSON.parse(body.toString())).toEqual(command)
      expect(options).toMatchObject({
         persistent: true,
         contentType: 'application/json',
         messageId: 'task-1',
      })
   })

   it('should publish a result with the result routing key, persistent', async () => {
      const fake = channel()

      await publishResult(fake as never, result)

      const [[exchange, key, body, options]] = fake.publish.mock.calls

      expect(exchange).toBe(EXCHANGE)
      expect(key).toBe(RESULT_KEY)
      expect(JSON.parse(body.toString())).toEqual(result)
      expect(options).toMatchObject({ persistent: true })
   })

   it('should publish a copy of a message with the retry counter, keeping its id and body', async () => {
      const fake = channel()
      const original = {
         content: Buffer.from('{"task_id":"task-1"}'),
         properties: { messageId: 'task-1' },
      }

      await republishTask(fake as never, original as never, 2)

      const [[exchange, key, body, options]] = fake.publish.mock.calls

      expect(exchange).toBe(EXCHANGE)
      expect(key).toBe(TASK_KEY)
      expect(body.toString()).toBe('{"task_id":"task-1"}')
      expect(options).toMatchObject({
         persistent: true,
         messageId: 'task-1',
         headers: { 'x-retries': 2 },
      })
      expect(fake.waitForConfirms).toHaveBeenCalled()
   })

   it('should wait for the broker to confirm before returning', async () => {
      const fake = channel()
      let confirmed = false

      fake.waitForConfirms.mockImplementation(async () => {
         await Promise.resolve()
         confirmed = true
      })

      await publishTask(fake as never, command)

      expect(confirmed).toBe(true)
   })

   it('should fail when the broker does not confirm', async () => {
      const fake = channel()

      fake.waitForConfirms.mockRejectedValue(new Error('nacked'))

      await expect(publishTask(fake as never, command)).rejects.toThrow('nacked')
   })

   describe('task framework', () => {
      it('should publish the result of a task on the done key, persistent, with the task id as message id', async () => {
         const fake = channel()
         const done = { task_id: 'abc' } as TaskResult

         await publishRunResult(fake as never, done)

         const [[exchange, key, body, options]] = fake.publish.mock.calls

         expect(exchange).toBe(EXCHANGE)
         expect(key).toBe(TASK_DONE_KEY)
         expect(JSON.parse(body.toString())).toEqual(done)
         expect(options).toMatchObject({
            persistent: true,
            messageId: 'abc',
         })
         expect(fake.waitForConfirms).toHaveBeenCalled()
      })

      it('should publish the catalog on its own key', async () => {
         const fake = channel()
         const catalog = {
            worker: { build: 'abc1234' },
            tasks: [],
         } as unknown as TaskCatalog

         await publishCatalog(fake as never, catalog)

         expect(fake.publish.mock.calls[0][1]).toBe(TASK_CATALOG_KEY)
         expect(fake.waitForConfirms).toHaveBeenCalled()
      })

      it('should send a run again with a retry count, keeping its body and id', async () => {
         const fake = channel()
         const message = {
            content: Buffer.from('{"task":"x"}'),
            properties: { messageId: 'abc' },
         }

         await republishRun(fake as never, message as never, 2)

         const [[, key, body, options]] = fake.publish.mock.calls

         expect(key).toBe(RUN_KEY)
         expect(body.toString()).toBe('{"task":"x"}')
         expect(options).toMatchObject({
            messageId: 'abc',
            headers: { 'x-retries': 2 },
         })
      })
   })
})
