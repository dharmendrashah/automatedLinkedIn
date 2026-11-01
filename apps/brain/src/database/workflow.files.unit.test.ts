import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type Graph, postKey } from '@automatedLinkedIn/contracts'

import { ConflictError } from './conflict'
import { WorkflowService } from './workflow.service'

const mocks = vi.hoisted(() => ({
   findFirst: vi.fn(),
   update: vi.fn(),
   deleteMany: vi.fn(),
   runCount: vi.fn(),
   dropFiles: vi.fn(),
}))

vi.mock('./prisma.service', () => ({
   PrismaService: {
      client: {
         workflow: {
            findFirst: mocks.findFirst,
            update: mocks.update,
            deleteMany: mocks.deleteMany,
         },
         workflowRun: { count: mocks.runCount },
      },
   },
}))

vi.mock('./postFileKeys', async () => ({
   ...(await vi.importActual<object>('./postFileKeys')),
   dropFiles: mocks.dropFiles,
}))

vi.mock('env', () => ({
   DATA_WALLET_FLOOR_USD: 5,
   DATA_WALLET_WARN_USD: 25,
}))

const USER = 'u1'
const FILE = '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34'
const OTHER_FILE = '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b35'

const graphWith = (userId: string, fileId: string | null): Graph => ({
   nodes: [
      {
         id: 'write',
         type: 'account.writePost',
         config: {
            post: JSON.stringify(
               fileId
                  ? [
                       {
                          id: 'd1',
                          type: 'DOCUMENT',
                          file: {
                             id: fileId,
                             name: 'a.pdf',
                             bytes: 100,
                             key: postKey(userId, fileId, 'a.pdf'),
                          },
                       },
                    ]
                  : []
            ),
         },
         position: {
            x: 0,
            y: 0,
         },
      },
   ],
   edges: [],
})

const current = (graph: Graph) => ({
   id: 'w1',
   name: 'Posts',
   enabled: false,
   qualifyScore: 70,
   maybeScore: 40,
   graph,
})

describe('WorkflowService files of written posts', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      mocks.update.mockResolvedValue({ id: 'w1' })
      mocks.runCount.mockResolvedValue(0)
      mocks.dropFiles.mockResolvedValue(undefined)
   })

   it('should delete the files a saved graph no longer holds, and keep the ones it still does', async () => {
      mocks.findFirst.mockResolvedValue(current(graphWith(USER, FILE)))

      await WorkflowService.update(USER, 'w1', { graph: graphWith(USER, OTHER_FILE) })

      expect(mocks.dropFiles).toHaveBeenCalledWith([postKey(USER, FILE, 'a.pdf')])

      mocks.dropFiles.mockClear()
      await WorkflowService.update(USER, 'w1', { graph: graphWith(USER, FILE) })

      expect(mocks.dropFiles).toHaveBeenCalledWith([])
   })

   it('should refuse a graph whose post points at a file of someone else', async () => {
      mocks.findFirst.mockResolvedValue(current(graphWith(USER, null)))

      await expect(
         WorkflowService.update(USER, 'w1', { graph: graphWith('someone-else', FILE) })
      ).rejects.toBeInstanceOf(ConflictError)
      expect(mocks.update).not.toHaveBeenCalled()
   })

   it('should delete the files of a workflow that is deleted, only when it was deleted', async () => {
      mocks.findFirst.mockResolvedValue(current(graphWith(USER, FILE)))
      mocks.deleteMany.mockResolvedValue({ count: 1 })

      await expect(WorkflowService.delete(USER, 'w1')).resolves.toBe(true)
      expect(mocks.dropFiles).toHaveBeenCalledWith([postKey(USER, FILE, 'a.pdf')])

      mocks.dropFiles.mockClear()
      mocks.deleteMany.mockResolvedValue({ count: 0 })

      await expect(WorkflowService.delete(USER, 'w1')).resolves.toBe(false)
      expect(mocks.dropFiles).not.toHaveBeenCalled()
   })
})
