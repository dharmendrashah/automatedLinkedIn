import { beforeEach, describe, expect, it, vi } from 'vitest'

import { STEP_ERROR_CODES } from '@automatedLinkedIn/contracts'

import { router } from 'trpc'

import { type Context } from '../../context'
import { workflow } from './workflow'

const mocks = vi.hoisted(() => ({
   update: vi.fn(),
   remove: vi.fn(),
   input: vi.fn(),
   problems: vi.fn(),
   readGraph: vi.fn(),
}))

vi.mock('database', () => ({
   ConflictError: class ConflictError extends Error {},
   TaskRefusedError: class TaskRefusedError extends Error {},
   InputPickService: {},
   WorkflowRunService: {},
   WorkflowTriggerService: {},
   WorkflowService: {
      update: mocks.update,
      delete: mocks.remove,
      input: mocks.input,
      problems: mocks.problems,
   },
   readGraph: mocks.readGraph,
}))

vi.mock('core', () => ({
   CSV_MAX_ROWS: 10_000,
   itemsCsv: vi.fn(),
}))

vi.mock('env', () => ({
   AUTHENTIK_ISSUER: 'http://localhost:9000/application/o/automatedlinkedin/',
   AUTHENTIK_CLIENT_ID: 'automatedlinkedin',
   AUTHENTIK_INTERNAL_URL: '',
   DATABASE_URL: 'postgresql://localhost:5432/test',
   CORS_ORIGINS: 'http://localhost:3000',
   LINKEDIN_CRED_ENC_KEY: 'pqaZGClH/kqxNTLoLT4c0lMTloNIi2At3Jzz9a2rkIQ=',
   GIT_SHA: 'test',
   BUILD_TIME: 'test',
   PORT: 3001,
}))

const ctx = {
   auth: {
      token: 'tok',
      sub: 'sub-1',
   },
   user: { id: 'u1' },
} as unknown as Context

const caller = () => router({ workflow }).createCaller(ctx).workflow

describe('workflow resolvers (saving, deleting and reading what reached a block)', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      mocks.problems.mockResolvedValue([])
      mocks.readGraph.mockReturnValue({
         nodes: [],
         edges: [],
      })
   })

   it('should list the advice of every step error code', async () => {
      const advice = await caller().stepErrors()

      expect(advice.map(({ code }) => code)).toEqual([...STEP_ERROR_CODES])
   })

   it('should hand the copy the editor loaded to the save as a date, and answer why a workflow was switched off', async () => {
      mocks.update.mockResolvedValueOnce({
         id: 'w1',
         graph: {},
         switchedOff: 'Task result needs a block before it to look at.',
      })

      const saved = await caller().update({
         id: 'w1',
         expectedUpdatedAt: '2026-11-01T10:00:00.000Z',
      })

      expect(mocks.update).toHaveBeenCalledWith(
         'u1',
         'w1',
         {},
         { expectedUpdatedAt: new Date('2026-11-01T10:00:00.000Z') }
      )
      expect(saved.switchedOff).toBe('Task result needs a block before it to look at.')
   })

   it('should save with no copy to compare when the owner chose to save anyway', async () => {
      mocks.update.mockResolvedValueOnce({
         id: 'w1',
         graph: {},
         switchedOff: null,
      })

      await caller().update({ id: 'w1' })

      expect(mocks.update).toHaveBeenCalledWith('u1', 'w1', {}, { expectedUpdatedAt: undefined })
   })

   it('should answer a save on an older copy, and a delete while a run is going, as a conflict', async () => {
      const { ConflictError } = await import('database')

      mocks.update.mockRejectedValueOnce(new ConflictError('changed somewhere else'))
      mocks.remove.mockRejectedValueOnce(new ConflictError('Stop it first'))

      await expect(caller().update({ id: 'w1' })).rejects.toMatchObject({ code: 'CONFLICT' })
      await expect(caller().delete({ id: 'w1' })).rejects.toMatchObject({ code: 'CONFLICT' })
   })

   it('should read what reached a block for the owner, a page at a time, and answer a foreign run as missing', async () => {
      mocks.input.mockResolvedValueOnce({
         total: 0,
         items: [],
      })

      await caller().input({
         runId: 'r1',
         nodeId: 'a',
         page: 3,
         pageSize: 10,
      })

      expect(mocks.input).toHaveBeenCalledWith('u1', {
         runId: 'r1',
         nodeId: 'a',
         skip: 20,
         take: 10,
      })

      mocks.input.mockResolvedValueOnce(null)

      await expect(
         caller().input({
            runId: 'someone-elses',
            nodeId: 'a',
         })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
   })
})
