import { describe, expect, it, vi } from 'vitest'

import { TASK_NAME_PATTERN } from '@automatedLinkedIn/contracts'

import { TASK_HOOKS } from './taskHooks'

vi.mock('./prisma.service', () => ({ PrismaService: { client: {} } }))

describe('TASK_HOOKS', () => {
   it('should be keyed by valid task names, each with at least one hook', () => {
      for (const [task, hooks] of Object.entries(TASK_HOOKS)) {
         expect(task).toMatch(TASK_NAME_PATTERN)
         expect(hooks.onRequest ?? hooks.onResult).toBeTypeOf('function')
      }
   })
})
