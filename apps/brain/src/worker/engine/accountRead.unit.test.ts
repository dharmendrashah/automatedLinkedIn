import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type Graph } from '@automatedLinkedIn/contracts'

import { runAccountRead } from './accountRead'
import { type Context, StepError, Waiting } from './context'

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
      ofStep: vi.fn(),
      ask: vi.fn(),
      settle: vi.fn(),
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
   AccountActionService: {
      ofStep: mocks.ofStep,
      ask: mocks.ask,
      settle: mocks.settle,
   },
   ConnectionReadService: {},
   WorkflowRunService: {
      setNote: mocks.setNote,
      replaceItems: mocks.replaceItems,
   },
   IcpService: {},
   WalletService: {},
   floorMicros: () => 0,
}))

const HOUR_MS = 60 * 60 * 1000

const graph = (settings: Record<string, string | number> = {}): Graph => ({
   nodes: [
      {
         id: 'pool',
         type: 'account.select',
         config: { accounts: ['a1', 'a2'] },
         position: {
            x: 0,
            y: 0,
         },
      },
      {
         id: 'read',
         type: 'account.getConnections',
         config: settings,
         position: {
            x: 0,
            y: 100,
         },
      },
   ],
   edges: [
      {
         from: 'pool',
         to: 'read',
      },
   ],
})

const context = (
   overrides: { preview?: boolean; startedAt?: Date; settings?: Record<string, string | number> } = {}
) => {
   const { preview = false, startedAt = new Date(), settings } = overrides
   const built = graph(settings)

   return {
      run: {
         id: 'r1',
         userId: 'u1',
         startedAt: new Date(),
         stopRequestedAt: null,
      },
      graph: built,
      node: built.nodes.find(({ id }) => id === 'read'),
      step: {
         id: 's1',
         tries: 0,
         startedAt,
         message: null,
      },
      at: {
         runId: 'r1',
         nodeId: 'read',
         round: 0,
      },
      inputs: [],
      preview,
      deps: { log: { info: vi.fn() } },
   } as unknown as Context
}

const driver = () => ({
   noun: 'people',
   ask: vi.fn().mockResolvedValue(true),
   state: vi.fn().mockResolvedValue('RUNNING'),
   items: vi.fn().mockResolvedValue([
      {
         kind: 'profile',
         slug: 'ada',
         url: 'https://www.linkedin.com/in/ada',
      },
   ]),
})

const active = (...ids: string[]) =>
   ids.map(id => ({
      id,
      status: 'ACTIVE',
   }))

const call = (accountId: string, state: string) => ({
   id: `c-${accountId}`,
   slug: accountId,
   accountId,
   state,
   createdAt: new Date(),
})

const kept = () => mocks.replaceItems.mock.calls[0]?.[1] as { slug: string }[]

describe('runAccountRead', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      mocks.accounts.mockResolvedValue(active('a1', 'a2'))
      mocks.ofStep.mockResolvedValue([])
   })

   it('should ask each signed-in account once and wait while the reads run', async () => {
      const read = driver()

      mocks.ofStep.mockResolvedValueOnce([]).mockResolvedValueOnce([call('a1', 'ASKED'), call('a2', 'ASKED')])

      await expect(runAccountRead(context(), read, 100)).rejects.toBeInstanceOf(Waiting)

      expect(read.ask.mock.calls.map(args => args[1])).toEqual(['a1', 'a2'])
      expect(mocks.ask).toHaveBeenCalledTimes(2)
      expect(mocks.setNote).toHaveBeenCalledWith('s1', 'Waiting for 2 of 2 accounts to be read.')
   })

   it('should not ask an account again, settle the reads that ended, and give what the finished accounts gave', async () => {
      const read = driver()

      read.state.mockImplementation((accountId: string) => Promise.resolve(accountId === 'a1' ? 'DONE' : 'FAILED'))
      mocks.ofStep.mockResolvedValue([call('a1', 'ASKED'), call('a2', 'ASKED')])

      const result = await runAccountRead(context(), read, 100)

      expect(read.ask).not.toHaveBeenCalled()
      expect(mocks.settle.mock.calls).toEqual([
         ['c-a1', 'DONE'],
         ['c-a2', 'FAILED'],
      ])
      expect(read.items).toHaveBeenCalledWith('u1', ['a1'], 100)
      expect(result).toMatchObject({
         status: 'PARTIAL',
         message: 'Read 1 people from 1 of 2 accounts: 1 could not be read.',
      })
      expect(kept().map(({ slug }) => slug)).toEqual(['ada'])
   })

   it('should count an account that can never be asked as failed, and go on with the others', async () => {
      const read = driver()

      read.ask.mockRejectedValueOnce(new mocks.AccountNotReadyError('not signed in')).mockResolvedValueOnce(true)
      mocks.ofStep
         .mockResolvedValueOnce([])
         .mockResolvedValueOnce([call('a1', 'FAILED'), call('a2', 'ASKED')])
         .mockResolvedValue([call('a1', 'FAILED'), call('a2', 'ASKED')])
      read.state.mockResolvedValue('RUNNING')

      await expect(runAccountRead(context(), read, 100)).rejects.toBeInstanceOf(Waiting)
      expect(mocks.ask).toHaveBeenCalledWith('r1', 'read', 'a1', 'a1', 'FAILED')
   })

   it('should leave what is not read for the next run once the time limit passed', async () => {
      const read = driver()

      mocks.ofStep.mockResolvedValue([call('a1', 'ASKED'), call('a2', 'ASKED')])

      const result = await runAccountRead(context({ startedAt: new Date(Date.now() - 3 * HOUR_MS) }), read, 100)

      expect(read.ask).not.toHaveBeenCalled()
      expect(result).toMatchObject({
         status: 'PARTIAL',
         message: 'Read 0 people from 0 of 2 accounts: 2 left for the next run.',
      })
   })

   it('should read nothing new in a preview, and fail when no account is chosen or signed in', async () => {
      const read = driver()
      const result = await runAccountRead(context({ preview: true }), read, 100)

      expect(read.ask).not.toHaveBeenCalled()
      expect(result.message).toContain('A preview reads nothing new')

      mocks.accounts.mockResolvedValue([])
      await expect(runAccountRead(context(), read, 100)).rejects.toThrow(StepError)

      mocks.accounts.mockResolvedValue([
         {
            id: 'a1',
            status: 'PAUSED',
         },
      ])
      await expect(runAccountRead(context(), read, 100)).rejects.toThrow('need to be signed in')
   })
})
