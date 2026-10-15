import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { RUNNER_VERDICTS, taskCatalogEntrySchema, taskCatalogSchema } from '@automatedLinkedIn/contracts'

import { catalogEntryOf, catalogOf } from './catalog'
import { buildTasks } from './registry'

const TASKS = buildTasks({
   linkedin: {
      validator: {
         validate: async () => ({
            outcome: 'ERROR' as const,
            message: 'x',
         }),
         recheck: async () => ({
            outcome: 'ERROR' as const,
            message: 'x',
         }),
      },
      baseUrl: 'https://www.linkedin.com',
   },
})

const folders = readdirSync(__dirname).filter(name => statSync(join(__dirname, name)).isDirectory())

// What every task must satisfy, so a new task cannot drift from the standard.
describe('the registered tasks', () => {
   it('should register every task folder, and only those', async () => {
      const names = await Promise.all(
         folders.map(
            async folder => ((await import(/* @vite-ignore */ `./${folder}`)) as { TASK_NAME?: string }).TASK_NAME
         )
      )

      expect(names.every(name => typeof name === 'string')).toBe(true)
      expect([...names].sort()).toEqual(TASKS.map(task => task.name).sort())
   })

   it('should have a different name for every task', () => {
      expect(new Set(TASKS.map(task => task.name)).size).toBe(TASKS.length)
   })

   it.each(TASKS.map(task => [task.name, task] as const))(
      'should describe %s completely for the catalog',
      (_name, task) => {
         expect(taskCatalogEntrySchema.safeParse(catalogEntryOf(task)).success).toBe(true)
         expect(Object.keys(task.verdicts).length).toBeGreaterThan(0)
         expect(task.limits.timeoutMs).toBeGreaterThan(0)
      }
   )

   it.each(TASKS.map(task => [task.name, task] as const))(
      'should not reuse a verdict the runner gives itself (%s)',
      (_name, task) => {
         for (const code of Object.keys(task.verdicts)) {
            expect(Object.keys(RUNNER_VERDICTS)).not.toContain(code)
         }
      }
   )

   it.each(TASKS.map(task => [task.name, task] as const))(
      'should accept an empty-or-valid input as a JSON schema (%s)',
      (_name, task) => {
         expect(catalogEntryOf(task).input_schema).toMatchObject({ type: 'object' })
      }
   )

   it('should announce every task in one catalog message', () => {
      const catalog = catalogOf(TASKS, 'abc1234', new Date('2026-10-13T10:00:00.000Z'))

      expect(taskCatalogSchema.safeParse(catalog).success).toBe(true)
      expect(catalog.tasks.map(entry => entry.task)).toEqual(TASKS.map(task => task.name))
   })
})
