import { beforeEach, describe, expect, it, vi } from 'vitest'

import { person } from 'core/workflowItem'

import { type Graph } from '@automatedLinkedIn/contracts'

import { removeConnections } from './connectionBlocks'
import { type Context, Waiting } from './context'

const mocks = vi.hoisted(() => {
   class Refusal extends Error {}

   return {
      BrowseBudgetError: class BrowseBudgetError extends Refusal {},
      TaskBusyError: class TaskBusyError extends Refusal {},
      TaskRecentError: class TaskRecentError extends Refusal {},
      PageVisitRefusedError: class PageVisitRefusedError extends Refusal {},
      TaskUnavailableError: class TaskUnavailableError extends Refusal {},
      TaskNeedsProxyError: class TaskNeedsProxyError extends Refusal {},
      AccountNotReadyError: class AccountNotReadyError extends Refusal {},
      TaskRefusedError: class TaskRefusedError extends Refusal {},
      accounts: vi.fn(),
      seenAmong: vi.fn(),
      ofStep: vi.fn(),
      ask: vi.fn(),
      settle: vi.fn(),
      connected: vi.fn(),
      standing: vi.fn(),
      remove: vi.fn(),
      setNote: vi.fn(),
      replaceItems: vi.fn(),
   }
})

vi.mock('env', () => ({}))

vi.mock('core', async () => ({
   ...(await vi.importActual<object>('core/workflowItem')),
   readSeniorities: vi.fn(),
}))
vi.mock('core/dataClient', () => ({ DataServiceError: class DataServiceError extends Error {} }))
vi.mock('core/dataJob', () => ({ advanceJob: vi.fn() }))

vi.mock('database', async () => ({
   BrowseBudgetError: mocks.BrowseBudgetError,
   TaskBusyError: mocks.TaskBusyError,
   TaskRecentError: mocks.TaskRecentError,
   PageVisitRefusedError: mocks.PageVisitRefusedError,
   TaskUnavailableError: mocks.TaskUnavailableError,
   TaskNeedsProxyError: mocks.TaskNeedsProxyError,
   AccountNotReadyError: mocks.AccountNotReadyError,
   TaskRefusedError: mocks.TaskRefusedError,
   VisitPoolService: { accounts: mocks.accounts },
   WorkflowListService: { seenAmong: mocks.seenAmong },
   AccountActionService: {
      ofStep: mocks.ofStep,
      ask: mocks.ask,
      settle: mocks.settle,
   },
   ConnectionRemoveService: {
      connected: mocks.connected,
      standing: mocks.standing,
   },
   LinkedInConnectionService: { remove: mocks.remove },
   WorkflowRunService: {
      setNote: mocks.setNote,
      replaceItems: mocks.replaceItems,
   },
   IcpService: {},
   WalletService: {},
   floorMicros: () => 0,
}))

const graph = (settings: Record<string, string | boolean | number>): Graph => ({
   nodes: [
      {
         id: 'n1',
         type: 'account.removeConnection',
         config: {
            accountMode: 'one',
            account: 'a1',
            ...settings,
         },
         position: {
            x: 0,
            y: 0,
         },
      },
   ],
   edges: [],
})

const ada = person({
   slug: 'ada',
   url: 'https://www.linkedin.com/in/ada',
})
const bob = person({
   slug: 'bob',
   url: 'https://www.linkedin.com/in/bob',
})

const context = (overrides: { preview?: boolean; settings?: Record<string, string | boolean | number> } = {}) => {
   const built = graph(overrides.settings ?? {})

   return {
      run: {
         id: 'r1',
         userId: 'u1',
         startedAt: new Date(),
         stopRequestedAt: null,
      },
      graph: built,
      node: built.nodes[0],
      step: {
         id: 's1',
         tries: 0,
         startedAt: new Date(),
         message: null,
      },
      at: {
         runId: 'r1',
         nodeId: 'n1',
         round: 0,
      },
      inputs: [ada, bob],
      preview: overrides.preview ?? false,
      deps: { log: { info: vi.fn() } },
   } as unknown as Context
}

const call = (slug: string, state: string, result: object = {}, accountId = 'a1') => ({
   id: `c-${slug}`,
   slug,
   accountId,
   state,
   result,
   createdAt: new Date(),
})

const resultsOf = () =>
   Object.fromEntries(
      (
         mocks.replaceItems.mock.calls[0]?.[1] as { slug: string; result: { status: string; reason: string | null } }[]
      ).map(item => [item.slug, item.result.status])
   )

const armed = { actForReal: true }

beforeEach(() => {
   vi.resetAllMocks()
   mocks.accounts.mockResolvedValue([
      {
         id: 'a1',
         status: 'ACTIVE',
      },
   ])
   mocks.seenAmong.mockResolvedValue(new Set())
   mocks.ofStep.mockResolvedValue([])
   mocks.standing.mockResolvedValue(new Map())
   mocks.connected.mockResolvedValue(new Map())
   mocks.remove.mockResolvedValue({ started: true })
})

describe('removeConnections', () => {
   it('should remove nothing in a preview, or while Act for real is off', async () => {
      const preview = await removeConnections(
         context({
            preview: true,
            settings: armed,
         })
      )

      expect(preview.message).toBe('A preview removes nothing.')
      expect(resultsOf()).toEqual({
         ada: 'NOT_ASKED',
         bob: 'NOT_ASKED',
      })

      const off = await removeConnections(context())

      expect(off.message).toContain('Act for real is off')
      expect(mocks.remove).not.toHaveBeenCalled()
   })

   it('should ask for each person still on the list, skip the rest with why, and wait while the removal runs', async () => {
      mocks.connected.mockResolvedValue(
         new Map([
            [
               'ada',
               {
                  id: 'k-ada',
                  accountId: 'a1',
               },
            ],
         ])
      )
      mocks.ofStep
         .mockResolvedValueOnce([])
         .mockResolvedValue([call('ada', 'ASKED', { ref: 'k-ada' }), call('bob', 'DONE', { status: 'SKIPPED' }, '')])

      await expect(removeConnections(context({ settings: armed }))).rejects.toBeInstanceOf(Waiting)

      expect(mocks.remove).toHaveBeenCalledWith('u1', 'a1', 'k-ada')
      expect(mocks.ask).toHaveBeenCalledWith('r1', 'n1', 'ada', 'a1', 'ASKED', { ref: 'k-ada' })
      expect(mocks.ask).toHaveBeenCalledWith('r1', 'n1', 'bob', '', 'DONE', {
         status: 'SKIPPED',
         reason: 'Not on the list of connections of the chosen accounts.',
      })
   })

   it('should say removed, or gone when the connection was not on the list any more, and UNKNOWN when it may have gone', async () => {
      mocks.ofStep.mockResolvedValue([call('ada', 'ASKED', { ref: 'k-ada' }), call('bob', 'ASKED', { ref: 'k-bob' })])
      mocks.standing.mockResolvedValue(
         new Map([
            [
               'k-ada',
               {
                  status: 'DONE',
                  reason: null,
                  label: 'REMOVED',
               },
            ],
            [
               'k-bob',
               {
                  status: 'UNSURE',
                  reason: 'No answer came from the browser.',
               },
            ],
         ])
      )

      const result = await removeConnections(context({ settings: armed }))

      expect(mocks.settle).toHaveBeenCalledWith('c-ada', 'DONE', { status: 'REMOVED' })
      expect(resultsOf()).toEqual({
         ada: 'REMOVED',
         bob: 'UNKNOWN',
      })
      expect(result).toMatchObject({
         status: 'PARTIAL',
         message: 'Removed 1 of 2: 1 not removed, see each result.',
      })
   })

   it("should leave a removal for the next run at the day's limit, and wait while the rest between two removals lasts", async () => {
      mocks.connected.mockResolvedValue(
         new Map([
            [
               'ada',
               {
                  id: 'k-ada',
                  accountId: 'a1',
               },
            ],
            [
               'bob',
               {
                  id: 'k-bob',
                  accountId: 'a1',
               },
            ],
         ])
      )
      mocks.remove
         .mockRejectedValueOnce(
            new mocks.TaskRefusedError('This account has used its removals for today. It can remove again tomorrow.')
         )
         .mockRejectedValueOnce(new mocks.TaskRefusedError('Wait 30 seconds before removing another connection.'))
      mocks.ofStep.mockResolvedValueOnce([]).mockResolvedValue([
         call('ada', 'FAILED', {
            status: 'LEFT',
            reason: 'The account reached its removals for today. Left for the next run.',
         }),
      ])

      await expect(removeConnections(context({ settings: armed }))).rejects.toBeInstanceOf(Waiting)

      expect(mocks.ask).toHaveBeenCalledTimes(1)
      expect(mocks.ask).toHaveBeenCalledWith(
         'r1',
         'n1',
         'ada',
         'a1',
         'FAILED',
         expect.objectContaining({ status: 'LEFT' })
      )
   })
})
