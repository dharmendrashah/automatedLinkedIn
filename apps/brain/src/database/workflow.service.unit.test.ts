import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkflowService } from './workflow.service'

const mocks = vi.hoisted(() => ({
   findFirst: vi.fn(),
   findMany: vi.fn(),
}))

vi.mock('./prisma.service', () => ({
   PrismaService: {
      client: {
         workflowRun: {
            findFirst: mocks.findFirst,
            findMany: mocks.findMany,
         },
      },
   },
}))

vi.mock('env', () => ({
   DATA_WALLET_FLOOR_USD: 5,
   DATA_WALLET_WARN_USD: 25,
}))

// Runs and steps reach the browser; the supplier's job ids and raw rows must not.
describe('WorkflowService run answers', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should select no supplier fields for a run, its steps or the run list', async () => {
      await WorkflowService.run('u1', 'r1')
      await WorkflowService.runs('u1', 'w1')

      const selects = JSON.stringify([mocks.findFirst.mock.calls[0][0].select, mocks.findMany.mock.calls[0][0].select])

      expect(selects).not.toMatch(/jobId|calls|"items"|"error"/i)
      expect(mocks.findFirst.mock.calls[0][0].where).toEqual({
         id: 'r1',
         userId: 'u1',
      })
   })
})
