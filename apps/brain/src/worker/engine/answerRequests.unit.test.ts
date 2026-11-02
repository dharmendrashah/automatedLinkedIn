import { beforeEach, describe, expect, it, vi } from 'vitest'

import { person } from 'core/workflowItem'

import { type Graph } from '@automatedLinkedIn/contracts'

import { answerRequests } from './answerRequests'
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
      seenAmong: vi.fn(),
      ofStep: vi.fn(),
      ask: vi.fn(),
      settle: vi.fn(),
      pending: vi.fn(),
      answer: vi.fn(),
      standing: vi.fn(),
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
   InvitationAnswerService: {
      PER_RUN: 10,
      pending: mocks.pending,
      answer: mocks.answer,
      standing: mocks.standing,
   },
   WorkflowRunService: {
      setNote: mocks.setNote,
      replaceItems: mocks.replaceItems,
   },
   IcpService: {},
   WalletService: {},
   floorMicros: () => 0,
}))

const HOUR_MS = 60 * 60 * 1000

const graph = (settings: Record<string, string | boolean | number> = {}): Graph => ({
   nodes: [
      {
         id: 'answer',
         type: 'account.answerRequests',
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

const context = (
   overrides: { preview?: boolean; startedAt?: Date; settings?: Record<string, string | boolean | number> } = {}
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
      node: built.nodes[0],
      step: {
         id: 's1',
         tries: 0,
         startedAt,
         message: null,
      },
      at: {
         runId: 'r1',
         nodeId: 'answer',
         round: 0,
      },
      inputs: [ada, bob],
      preview,
      deps: { log: { info: vi.fn() } },
   } as unknown as Context
}

const call = (slug: string, state: string, result: object = {}) => ({
   id: `c-${slug}`,
   slug,
   accountId: 'a1',
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

describe('answerRequests', () => {
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
      mocks.pending.mockResolvedValue([])
      mocks.standing.mockResolvedValue(new Map())
      mocks.answer.mockResolvedValue(true)
   })

   it('should answer nothing in a preview, or while Act for real is off, and say so on each person', async () => {
      const preview = await answerRequests(
         context({
            preview: true,
            settings: { actForReal: true },
         })
      )

      expect(preview.message).toBe('A preview answers nothing.')
      expect(resultsOf()).toEqual({
         ada: 'NOT_ASKED',
         bob: 'NOT_ASKED',
      })

      mocks.replaceItems.mockClear()

      const off = await answerRequests(context())

      expect(off.message).toContain('Act for real is off')
      expect(mocks.answer).not.toHaveBeenCalled()
   })

   it('should ask each account for the requests it received, and wait while they are answered', async () => {
      mocks.pending.mockResolvedValue([
         {
            id: 'i-ada',
            slug: 'ada',
            accountId: 'a1',
         },
         {
            id: 'i-bob',
            slug: 'bob',
            accountId: 'a1',
         },
      ])
      mocks.ofStep
         .mockResolvedValueOnce([])
         .mockResolvedValue([call('ada', 'ASKED', { ref: 'i-ada' }), call('bob', 'ASKED', { ref: 'i-bob' })])

      await expect(answerRequests(context({ settings: { actForReal: true } }))).rejects.toBeInstanceOf(Waiting)

      expect(mocks.answer).toHaveBeenCalledWith('u1', 'a1', ['i-ada', 'i-bob'], 'ACCEPT')
      expect(mocks.ask).toHaveBeenCalledWith('r1', 'answer', 'ada', 'a1', 'ASKED', { ref: 'i-ada' })
   })

   it('should give each person what came of the request, and skip people on the do-not-contact list or with no request', async () => {
      mocks.seenAmong.mockResolvedValue(new Set(['bob']))
      mocks.ofStep.mockResolvedValue([call('ada', 'ASKED', { ref: 'i-ada' })])
      mocks.standing.mockResolvedValue(
         new Map([
            [
               'i-ada',
               {
                  status: 'DONE',
                  reason: null,
               },
            ],
         ])
      )

      const result = await answerRequests(
         context({
            settings: {
               actForReal: true,
               action: 'ignore',
            },
         })
      )

      expect(mocks.settle).toHaveBeenCalledWith('c-ada', 'DONE', { status: 'IGNORED' })
      expect(resultsOf()).toEqual({
         ada: 'IGNORED',
         bob: 'SKIPPED',
      })
      expect(result).toMatchObject({
         status: 'PARTIAL',
         message: "Answered 1 of 2 requests: 1 not answered, see each person's result.",
      })
   })

   it('should leave the rest for the next run when the account reached its answers for today', async () => {
      mocks.pending.mockResolvedValue([
         {
            id: 'i-ada',
            slug: 'ada',
            accountId: 'a1',
         },
      ])
      mocks.answer.mockRejectedValue(
         new mocks.TaskRefusedError('This account has used its answers for today. It can answer again tomorrow.')
      )
      mocks.ofStep.mockResolvedValueOnce([]).mockResolvedValue([
         call('ada', 'FAILED', {
            status: 'LEFT',
            reason: 'The account reached its answers for today. Left for the next run.',
         }),
      ])

      const result = await answerRequests(context({ settings: { actForReal: true } }))

      expect(mocks.ask).toHaveBeenCalledWith(
         'r1',
         'answer',
         'ada',
         'a1',
         'FAILED',
         expect.objectContaining({ status: 'LEFT' })
      )
      expect(resultsOf().ada).toBe('LEFT')
      expect(result.status).toBe('PARTIAL')
   })

   it('should leave what is not answered once the time limit passed, and fail when no account is signed in', async () => {
      mocks.ofStep.mockResolvedValue([call('ada', 'ASKED', { ref: 'i-ada' })])

      const late = await answerRequests(
         context({
            startedAt: new Date(Date.now() - 9 * HOUR_MS),
            settings: { actForReal: true },
         })
      )

      expect(mocks.answer).not.toHaveBeenCalled()
      expect(late.status).toBe('PARTIAL')
      expect(resultsOf().ada).toBe('LEFT')

      mocks.ofStep.mockResolvedValue([])
      mocks.accounts.mockResolvedValue([
         {
            id: 'a1',
            status: 'PAUSED',
         },
      ])
      await expect(answerRequests(context({ settings: { actForReal: true } }))).rejects.toThrow(StepError)
   })
})
