import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TASK_CATALOG_QUEUE, TASK_DONE_QUEUE } from '@automatedLinkedIn/contracts'

import { CONSUMERS } from './registry'
import { catalogHandler, taskCatalog } from './taskCatalog'
import { taskResults } from './taskResults'

const mocks = vi.hoisted(() => ({
   applyResult: vi.fn(),
   applyCatalog: vi.fn(),
}))

vi.mock('database', () => ({
   TaskService: {
      applyResult: mocks.applyResult,
      applyCatalog: mocks.applyCatalog,
   },
}))

const result = {
   contract: 1 as const,
   task_id: '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11',
   task: 'browser-detection',
   task_version: 1,
   status: 'SUCCEEDED' as const,
   verdict: 'NOT_DETECTED',
   message: 'Every detection page took this browser for a person.',
   artifacts: [],
   artifacts_truncated: false,
   worker: { build: 'abc1234' },
   started_at: '2026-10-13T10:00:00.000Z',
   finished_at: '2026-10-13T10:01:00.000Z',
}

const catalog = (announcedAt: string) => ({
   contract: 1 as const,
   announced_at: announcedAt,
   worker: { build: 'abc1234' },
   tasks: [],
})

describe('worker consumers', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should register the result and catalog consumers, each on its own queue', () => {
      expect(CONSUMERS.map(({ name, queue }) => [name, queue])).toEqual([
         ['task-results', TASK_DONE_QUEUE],
         ['task-catalog', TASK_CATALOG_QUEUE],
      ])
   })

   describe('task-results', () => {
      it('should apply a result that matches the contract', async () => {
         const parsed = taskResults.parse(JSON.stringify(result))

         await taskResults.handle(parsed)

         expect(mocks.applyResult).toHaveBeenCalledWith(result)
      })

      it('should refuse a body that does not match the contract', () => {
         expect(() =>
            taskResults.parse(
               JSON.stringify({
                  ...result,
                  verdict: 'not a code',
               })
            )
         ).toThrow()
         expect(() => taskResults.parse('not json')).toThrow()
      })

      it('should let a failure through, so the runner retries it', async () => {
         mocks.applyResult.mockRejectedValue(new Error('database is down'))

         await expect(taskResults.handle(result)).rejects.toThrow('database is down')
      })

      it('should name the run in the log by task and id, nothing else', () => {
         expect(taskResults.label(result)).toBe(`browser-detection ${result.task_id}`)
      })
   })

   describe('task-catalog', () => {
      it('should store the catalog', async () => {
         const parsed = taskCatalog.parse(JSON.stringify(catalog('2026-10-13T10:00:00.000Z')))

         await taskCatalog.handle(parsed)

         expect(mocks.applyCatalog).toHaveBeenCalledWith(parsed)
      })

      it('should refuse a body that does not match the contract', () => {
         expect(() => taskCatalog.parse(JSON.stringify({ contract: 2 }))).toThrow()
      })
   })

   describe('catalogHandler', () => {
      it('should ignore a catalog older than the newest it applied', async () => {
         const apply = vi.fn().mockResolvedValue(undefined)
         const handle = catalogHandler(apply)

         await handle(catalog('2026-10-13T10:05:00.000Z'))
         await handle(catalog('2026-10-13T10:00:00.000Z'))

         expect(apply).toHaveBeenCalledTimes(1)

         await handle(catalog('2026-10-13T10:05:00.000Z'))
         await handle(catalog('2026-10-13T10:06:00.000Z'))

         expect(apply).toHaveBeenCalledTimes(3)
      })

      it('should not count a catalog that failed to apply as the newest', async () => {
         const apply = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(undefined)
         const handle = catalogHandler(apply)

         await expect(handle(catalog('2026-10-13T10:05:00.000Z'))).rejects.toThrow('x')
         await handle(catalog('2026-10-13T10:00:00.000Z'))

         expect(apply).toHaveBeenCalledTimes(2)
      })
   })
})
