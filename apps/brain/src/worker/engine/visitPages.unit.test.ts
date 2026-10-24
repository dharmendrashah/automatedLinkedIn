import { beforeEach, describe, expect, it, vi } from 'vitest'

import { person } from 'core/workflowItem'

import { type Graph } from '@automatedLinkedIn/contracts'

import { type Context, StepError, Waiting } from './context'
import { selectAccounts, visitCompany, visitProfile } from './visitPages'

const mocks = vi.hoisted(() => {
   class TaskRefusedError extends Error {}
   class TaskUnavailableError extends TaskRefusedError {}
   class TaskNeedsProxyError extends TaskRefusedError {}
   class AccountNotReadyError extends TaskRefusedError {}
   class TaskBusyError extends TaskRefusedError {}
   class TaskRecentError extends TaskRefusedError {}
   class PageVisitRefusedError extends TaskRefusedError {
      public readonly reason: string

      public constructor(message: string, reason: string) {
         super(message)
         this.reason = reason
      }
   }

   return {
      TaskRefusedError,
      TaskUnavailableError,
      TaskNeedsProxyError,
      AccountNotReadyError,
      TaskBusyError,
      TaskRecentError,
      PageVisitRefusedError,
      setNote: vi.fn(),
      accounts: vi.fn(),
      lastVisits: vi.fn(),
      viewedBy: vi.fn(),
      ofStep: vi.fn(),
      request: vi.fn(),
      seenAmong: vi.fn(),
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
   idleFirst: (await vi.importActual<{ idleFirst: unknown }>('database/visitPool')).idleFirst,
   PageVisitRefusedError: mocks.PageVisitRefusedError,
   TaskRefusedError: mocks.TaskRefusedError,
   TaskUnavailableError: mocks.TaskUnavailableError,
   TaskNeedsProxyError: mocks.TaskNeedsProxyError,
   AccountNotReadyError: mocks.AccountNotReadyError,
   TaskBusyError: mocks.TaskBusyError,
   TaskRecentError: mocks.TaskRecentError,
   PageVisitService: { request: mocks.request },
   VisitPoolService: {
      accounts: mocks.accounts,
      lastVisits: mocks.lastVisits,
      viewedBy: mocks.viewedBy,
      ofStep: mocks.ofStep,
   },
   WorkflowListService: { seenAmong: mocks.seenAmong },
   WorkflowRunService: {
      replaceItems: mocks.replaceItems,
      setNote: mocks.setNote,
   },
   IcpService: {},
   WalletService: {},
   floorMicros: () => 0,
}))

const HOUR_MS = 60 * 60 * 1000

const node = (id: string, type: Graph['nodes'][number]['type'], config: Graph['nodes'][number]['config'] = {}) => ({
   id,
   type,
   config,
   position: {
      x: 0,
      y: 0,
   },
})

const graph: Graph = {
   nodes: [
      node('pool', 'account.select', { accounts: ['a1', 'a2', 'a3'] }),
      node('go', 'account.visitProfile'),
      node('goCompany', 'account.visitCompany'),
   ],
   edges: [
      {
         from: 'pool',
         to: 'go',
      },
      {
         from: 'pool',
         to: 'goCompany',
      },
   ],
}

const ada = person({
   slug: 'ada',
   url: 'https://www.linkedin.com/in/ada',
})
const bob = person({
   slug: 'bob',
   url: 'https://www.linkedin.com/in/bob',
})
const acme = {
   kind: 'company' as const,
   slug: 'acme',
   url: 'https://www.linkedin.com/company/acme',
   name: null,
   hiring: [],
}

const context = (nodeId: string, inputs: Context['inputs'], overrides: Partial<Context> = {}) =>
   ({
      run: {
         id: 'r1',
         userId: 'u1',
         startedAt: new Date(),
         stopRequestedAt: null,
      },
      graph,
      node: graph.nodes.find(({ id }) => id === nodeId),
      step: { id: 's1' },
      at: {
         runId: 'r1',
         nodeId,
         round: 0,
      },
      inputs,
      preview: false,
      deps: { log: { info: vi.fn() } },
      ...overrides,
   }) as unknown as Context

const active = (...ids: string[]) =>
   ids.map(id => ({
      id,
      status: 'ACTIVE',
   }))

const kept = () => mocks.replaceItems.mock.calls[0]?.[1] as { slug: string }[]

describe('visit blocks', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      mocks.accounts.mockResolvedValue(active('a1', 'a2', 'a3'))
      mocks.lastVisits.mockResolvedValue(new Map())
      mocks.viewedBy.mockResolvedValue(new Set())
      mocks.ofStep.mockResolvedValue([])
      mocks.seenAmong.mockResolvedValue(new Set())
      mocks.request.mockResolvedValue({ id: 's' })
   })

   it('should give each person to the account that went longest without a visit', async () => {
      mocks.lastVisits.mockResolvedValue(
         new Map([
            ['a1', new Date('2020-10-25T10:00:00Z')],
            ['a2', new Date('2020-10-25T08:00:00Z')],
         ])
      )

      await expect(visitProfile(context('go', [ada, bob]))).rejects.toBeInstanceOf(Waiting)

      expect(mocks.request.mock.calls.map(call => [call[1], call[2].link])).toEqual([
         ['a3', ada.url],
         ['a2', bob.url],
      ])
      expect(mocks.request.mock.calls[0]).toEqual([
         'u1',
         'a3',
         {
            kind: 'PROFILE',
            link: ada.url,
         },
         undefined,
         {
            runId: 'r1',
            nodeId: 'go',
         },
      ])
   })

   it('should leave out a person on the do-not-contact list and one the pool viewed lately', async () => {
      mocks.seenAmong.mockResolvedValue(new Set(['ada']))
      mocks.viewedBy.mockResolvedValue(new Set(['bob']))
      mocks.accounts.mockResolvedValue(active('a1'))

      const result = await visitProfile(context('go', [ada, bob]))

      expect(mocks.request).not.toHaveBeenCalled()
      expect(result).toMatchObject({
         status: 'DONE',
         itemsIn: 2,
         itemsOut: 0,
      })
      expect(result.message).toContain('1 on your do-not-contact list')
      expect(result.message).toContain('1 viewed in the last 30 days')
   })

   it('should skip an account that cannot act now for the rest of the round, and wait', async () => {
      mocks.request.mockRejectedValueOnce(new mocks.TaskRefusedError('Wait 2 minute(s).'))

      await expect(visitProfile(context('go', [ada, bob]))).rejects.toBeInstanceOf(Waiting)

      expect(mocks.request.mock.calls.map(call => call[1])).toEqual(['a1', 'a2', 'a3'])
   })

   it('should try the next account when this one is the person’s own profile', async () => {
      mocks.request.mockRejectedValueOnce(new mocks.PageVisitRefusedError('Own profile.', 'OWN'))

      await expect(visitProfile(context('go', [ada]))).rejects.toBeInstanceOf(Waiting)

      expect(mocks.request.mock.calls.map(call => call[1])).toEqual(['a1', 'a2'])
   })

   it('should wait while a visit is going, and hand out everyone it handled once all ended', async () => {
      mocks.ofStep.mockResolvedValue([
         {
            slug: 'ada',
            accountId: 'a1',
            status: 'DONE',
         },
         {
            slug: 'bob',
            accountId: 'a2',
            status: 'ASKED',
         },
      ])
      await expect(visitProfile(context('go', [ada, bob]))).rejects.toBeInstanceOf(Waiting)
      expect(mocks.request).not.toHaveBeenCalled()

      mocks.ofStep.mockResolvedValue([
         {
            slug: 'ada',
            accountId: 'a1',
            status: 'DONE',
         },
         {
            slug: 'bob',
            accountId: 'a2',
            status: 'NOT_AVAILABLE',
         },
      ])

      const result = await visitProfile(context('go', [ada, bob]))

      expect(kept().map(({ slug }) => slug)).toEqual(['ada', 'bob'])
      expect(result).toMatchObject({
         status: 'PARTIAL',
         itemsIn: 2,
         itemsOut: 2,
      })
      expect(result.message).toContain('Viewed 1 of 2')
      expect(result.message).toContain('1 not available')
   })

   it('should try a failed visit once more on another account, and count it failed after that', async () => {
      mocks.ofStep.mockResolvedValue([
         {
            slug: 'ada',
            accountId: 'a1',
            status: 'FAILED',
         },
      ])
      await expect(visitProfile(context('go', [ada]))).rejects.toBeInstanceOf(Waiting)
      expect(mocks.request.mock.calls.map(call => call[1])).toEqual(['a2'])

      mocks.request.mockClear()
      mocks.ofStep.mockResolvedValue([
         {
            slug: 'ada',
            accountId: 'a1',
            status: 'FAILED',
         },
         {
            slug: 'ada',
            accountId: 'a2',
            status: 'FAILED',
         },
      ])

      const result = await visitProfile(context('go', [ada]))

      expect(mocks.request).not.toHaveBeenCalled()
      expect(result.message).toContain('1 failed')
   })

   it('should end after the time limit and leave the people not yet viewed for the next run', async () => {
      mocks.request.mockRejectedValue(new mocks.TaskRefusedError('Wait 2 minute(s).'))

      const result = await visitProfile(
         context('go', [ada], {
            run: {
               id: 'r1',
               userId: 'u1',
               startedAt: new Date(Date.now() - 9 * HOUR_MS),
               stopRequestedAt: null,
            },
         } as Partial<Context>)
      )

      expect(result.status).toBe('PARTIAL')
      expect(result.message).toContain('1 left for the next run')
   })

   it('should stop at once when the owner stopped the run, and fail when no chosen account is signed in', async () => {
      const stopped = await visitProfile(
         context('go', [ada], {
            run: {
               id: 'r1',
               userId: 'u1',
               startedAt: new Date(),
               stopRequestedAt: new Date(),
            },
         } as Partial<Context>)
      )

      expect(stopped.message).toContain('Stopped by you')

      mocks.accounts.mockResolvedValue([
         {
            id: 'a1',
            status: 'NEEDS_REAUTH',
         },
      ])
      await expect(visitProfile(context('go', [ada]))).rejects.toBeInstanceOf(StepError)
   })

   it('should start no visit in a preview and pass the people on', async () => {
      const result = await visitProfile(context('go', [ada], { preview: true }))

      expect(mocks.request).not.toHaveBeenCalled()
      expect(result.message).toContain('A preview visits nobody')
      expect(kept().map(({ slug }) => slug)).toEqual(['ada'])
   })

   it('should view a company page by its address, as a company', async () => {
      await expect(visitCompany(context('goCompany', [acme]))).rejects.toBeInstanceOf(Waiting)

      expect(mocks.request.mock.calls[0]?.[2]).toEqual({
         kind: 'COMPANY',
         link: acme.url,
      })
      expect(mocks.seenAmong).not.toHaveBeenCalled()
   })

   it('should say no account is usable when the block before it holds none of the owner’s', async () => {
      mocks.accounts.mockResolvedValue([])

      await expect(visitProfile(context('go', [ada]))).rejects.toBeInstanceOf(StepError)
      await expect(selectAccounts(context('pool', [ada]))).rejects.toBeInstanceOf(StepError)
   })

   it('should pass everything through the account block unchanged', async () => {
      const result = await selectAccounts(context('pool', [ada, acme]))

      expect(kept()).toEqual([ada, acme])
      expect(result).toMatchObject({
         status: 'DONE',
         itemsIn: 2,
         itemsOut: 2,
      })
   })

   describe('with a Retry right after it', () => {
      const withRetry = (waitSeconds: number): Graph => ({
         nodes: [
            ...graph.nodes,
            node('again', 'logic.retry', {
               times: 2,
               waitSeconds,
            }),
         ],
         edges: [
            ...graph.edges,
            {
               from: 'go',
               to: 'again',
            },
         ],
      })

      it('should give each person more tries, on the same account when it is the only one', async () => {
         mocks.accounts.mockResolvedValue(active('a1'))
         mocks.ofStep.mockResolvedValue([
            {
               slug: 'ada',
               accountId: 'a1',
               status: 'FAILED',
               createdAt: new Date(0),
            },
            {
               slug: 'ada',
               accountId: 'a1',
               status: 'FAILED',
               createdAt: new Date(0),
            },
         ])

         await expect(visitProfile(context('go', [ada], { graph: withRetry(0) }))).rejects.toBeInstanceOf(Waiting)
         expect(mocks.request.mock.calls.map(call => call[1])).toEqual(['a1'])

         mocks.request.mockClear()
         mocks.ofStep.mockResolvedValue(
            Array.from({ length: 4 }, () => ({
               slug: 'ada',
               accountId: 'a1',
               status: 'FAILED',
               createdAt: new Date(0),
            }))
         )

         const result = await visitProfile(context('go', [ada], { graph: withRetry(0) }))

         expect(mocks.request).not.toHaveBeenCalled()
         expect(kept().map(({ slug }) => slug)).toEqual(['ada'])
         expect(result.message).toContain('1 failed')
      })

      it('should keep an account that has not failed the person first', async () => {
         mocks.ofStep.mockResolvedValue([
            {
               slug: 'ada',
               accountId: 'a1',
               status: 'FAILED',
               createdAt: new Date(0),
            },
         ])

         await expect(visitProfile(context('go', [ada], { graph: withRetry(0) }))).rejects.toBeInstanceOf(Waiting)

         expect(mocks.request.mock.calls.map(call => call[1])).toEqual(['a2'])
      })

      it('should wait the pause the Retry sets before trying a failed visit again', async () => {
         mocks.ofStep.mockResolvedValue([
            {
               slug: 'ada',
               accountId: 'a1',
               status: 'FAILED',
               createdAt: new Date(),
            },
         ])

         await expect(visitProfile(context('go', [ada], { graph: withRetry(60) }))).rejects.toBeInstanceOf(Waiting)

         expect(mocks.request).not.toHaveBeenCalled()
      })
   })

   describe('when no account can take a visit', () => {
      const MINUTE_MS = 60_000
      const started = (minutes: number, message?: string) =>
         ({
            step: {
               id: 's1',
               startedAt: new Date(Date.now() - minutes * MINUTE_MS),
               message,
            },
         }) as unknown as Partial<Context>

      it('should say why it waits, once, and log it', async () => {
         mocks.request.mockRejectedValue(new mocks.TaskUnavailableError('This task is not available.'))

         const first = context('go', [ada], started(1))

         await expect(visitProfile(first)).rejects.toBeInstanceOf(Waiting)

         const [[, note]] = mocks.setNote.mock.calls

         expect(note).toContain('Waiting to visit 1 of 1')
         expect(note).toContain('the browser worker has not announced this action yet')
         expect(first.deps.log.info).toHaveBeenCalledWith(expect.stringContaining('has not announced'))

         mocks.setNote.mockClear()
         await expect(visitProfile(context('go', [ada], started(1, note)))).rejects.toBeInstanceOf(Waiting)
         expect(mocks.setNote).not.toHaveBeenCalled()
      })

      it('should end with the reason after 10 minutes when every account is blocked, not before', async () => {
         mocks.request.mockRejectedValue(new mocks.TaskUnavailableError('This task is not available.'))

         await expect(visitProfile(context('go', [ada], started(9)))).rejects.toBeInstanceOf(Waiting)

         const error: unknown = await visitProfile(context('go', [ada], started(11))).catch((caught: unknown) => caught)

         expect(error).toBeInstanceOf(StepError)
         expect((error as Error).message).toContain('has not announced')
      })

      it('should keep waiting past 10 minutes for a reason that clears by itself', async () => {
         mocks.request.mockRejectedValue(new mocks.TaskBusyError('A visit is already running.'))

         await expect(visitProfile(context('go', [ada], started(60)))).rejects.toBeInstanceOf(Waiting)
         expect(mocks.setNote.mock.calls[0]?.[1]).toContain('an account is busy with another visit')
      })

      it('should keep waiting when only some accounts are blocked', async () => {
         mocks.request
            .mockRejectedValueOnce(new mocks.AccountNotReadyError('Not signed in.'))
            .mockRejectedValueOnce(new mocks.TaskRecentError('Wait 2 minute(s).'))
            .mockRejectedValueOnce(new mocks.TaskNeedsProxyError('No proxy.'))

         await expect(visitProfile(context('go', [ada], started(60)))).rejects.toBeInstanceOf(Waiting)
      })

      it('should say so when no chosen account is signed in but a visit was asked before', async () => {
         mocks.accounts.mockResolvedValue([
            {
               id: 'a1',
               status: 'NEEDS_REAUTH',
            },
         ])
         mocks.ofStep.mockResolvedValue([
            {
               slug: 'bob',
               accountId: 'a1',
               status: 'DONE',
            },
         ])

         await expect(visitProfile(context('go', [ada], started(1)))).rejects.toBeInstanceOf(Waiting)
         expect(mocks.setNote.mock.calls[0]?.[1]).toContain('an account is not signed in')
      })

      it('should clear the note once a visit is asked', async () => {
         await expect(
            visitProfile(context('go', [ada], started(1, 'Waiting to visit 1 of 1: an account is busy.')))
         ).rejects.toBeInstanceOf(Waiting)

         expect(mocks.setNote).toHaveBeenCalledWith('s1', null)
      })

      it('should count its time limits from its own start, not from the start of the run', async () => {
         await expect(
            visitProfile(
               context('go', [ada], {
                  run: {
                     id: 'r1',
                     userId: 'u1',
                     startedAt: new Date(Date.now() - 9 * HOUR_MS),
                     stopRequestedAt: null,
                  },
                  ...started(1),
               } as Partial<Context>)
            )
         ).rejects.toBeInstanceOf(Waiting)

         expect(mocks.request).toHaveBeenCalled()
      })
   })
})
