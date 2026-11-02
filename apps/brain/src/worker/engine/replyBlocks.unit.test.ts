import { beforeEach, describe, expect, it, vi } from 'vitest'

import { person } from 'core/workflowItem'

import { type Graph } from '@automatedLinkedIn/contracts'

import { type Context, StepError, Waiting } from './context'
import { fillWords, replyToConversations, sendMessages } from './replyBlocks'

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
      start: vi.fn(),
      send: vi.fn(),
      standing: vi.fn(),
      connectedVia: vi.fn(),
      conversations: vi.fn(),
      companies: vi.fn(),
      recent: vi.fn(),
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
   LinkedInReplyService: {
      start: mocks.start,
      send: mocks.send,
   },
   ReplyActService: {
      standing: mocks.standing,
      connectedVia: mocks.connectedVia,
      conversations: mocks.conversations,
      companies: mocks.companies,
      recent: mocks.recent,
   },
   WorkflowRunService: {
      setNote: mocks.setNote,
      replaceItems: mocks.replaceItems,
   },
   IcpService: {},
   WalletService: {},
   floorMicros: () => 0,
}))

type BlockType = 'account.sendMessage' | 'account.replyToConversation'

const graph = (type: BlockType, settings: Record<string, string | boolean | number>): Graph => ({
   nodes: [
      {
         id: 'n1',
         type,
         config: {
            accountMode: 'one',
            account: 'a1',
            text: 'Hi {first_name} at {company}',
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
   name: 'Ada Lovelace',
   company: 'Analytical Engines',
})
const bob = person({
   slug: 'bob',
   url: 'https://www.linkedin.com/in/bob',
   name: 'Bob',
})

const conversation = (slug: string, name: string, personSlug: string | null) => ({
   kind: 'conversation' as const,
   slug,
   url: `https://www.linkedin.com/messaging/thread/${slug}/`,
   personSlug,
   name,
   headline: null,
   lastText: 'Hello',
   lastAt: null,
   lastFrom: 'THEM' as const,
   unread: true,
})

const context = (
   type: BlockType,
   inputs: unknown[],
   overrides: { preview?: boolean; startedAt?: Date; settings?: Record<string, string | boolean | number> } = {}
) => {
   const built = graph(type, overrides.settings ?? {})

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
         startedAt: overrides.startedAt ?? new Date(),
         message: null,
      },
      at: {
         runId: 'r1',
         nodeId: 'n1',
         round: 0,
      },
      inputs,
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
   mocks.connectedVia.mockResolvedValue(new Map())
   mocks.conversations.mockResolvedValue([])
   mocks.companies.mockResolvedValue(new Map())
   mocks.recent.mockResolvedValue(new Set())
   mocks.start.mockResolvedValue({ id: 'm-ada' })
   mocks.send.mockResolvedValue({ id: 'm-c1' })
})

describe('fillWords', () => {
   it("should put in the person's first name and company, and leave no gap for what is missing", () => {
      expect(
         fillWords('Hi {first_name} at {company}, ok', {
            name: 'Ada Lovelace',
            company: 'Engines',
         })
      ).toBe('Hi Ada at Engines, ok')
      expect(
         fillWords('Hi {first_name} at {company}, ok', {
            name: null,
            company: null,
         })
      ).toBe('Hi at, ok')
   })
})

describe('sendMessages', () => {
   it('should send nothing in a preview, or while Act for real is off', async () => {
      const preview = await sendMessages(
         context('account.sendMessage', [ada], {
            preview: true,
            settings: armed,
         })
      )

      expect(preview.message).toBe('A preview sends nothing.')
      expect(resultsOf()).toEqual({ ada: 'NOT_ASKED' })

      const off = await sendMessages(context('account.sendMessage', [ada]))

      expect(off.message).toContain('Act for real is off')
      expect(mocks.start).not.toHaveBeenCalled()
   })

   it('should write to connections with their words filled in, skip the rest with why, and wait while the queue sends', async () => {
      const cat = person({
         slug: 'cat',
         url: 'https://www.linkedin.com/in/cat',
      })

      mocks.seenAmong.mockResolvedValue(new Set(['cat']))
      mocks.connectedVia.mockResolvedValue(new Map([['ada', 'a1']]))
      mocks.ofStep
         .mockResolvedValueOnce([])
         .mockResolvedValue([
            call('ada', 'ASKED', { ref: 'm-ada' }),
            call('bob', 'DONE', { status: 'SKIPPED' }, ''),
            call('cat', 'DONE', { status: 'SKIPPED' }, ''),
         ])

      await expect(
         sendMessages(context('account.sendMessage', [ada, bob, cat], { settings: armed }))
      ).rejects.toBeInstanceOf(Waiting)

      expect(mocks.start).toHaveBeenCalledWith('u1', 'a1', 'ada', 'Hi Ada at Analytical Engines')
      expect(mocks.ask).toHaveBeenCalledWith('r1', 'n1', 'ada', 'a1', 'ASKED', { ref: 'm-ada' })
      expect(mocks.ask).toHaveBeenCalledWith('r1', 'n1', 'bob', '', 'DONE', {
         status: 'SKIPPED',
         reason: 'Not connected to any of the chosen accounts.',
      })
      expect(mocks.ask).toHaveBeenCalledWith('r1', 'n1', 'cat', '', 'DONE', {
         status: 'SKIPPED',
         reason: 'On your do-not-contact list.',
      })
   })

   it('should not write to someone this account wrote to lately', async () => {
      mocks.connectedVia.mockResolvedValue(new Map([['ada', 'a1']]))
      mocks.recent.mockResolvedValue(new Set(['a1:ada']))
      mocks.ofStep.mockResolvedValueOnce([]).mockResolvedValue([call('ada', 'DONE', { status: 'SKIPPED' }, '')])

      await sendMessages(context('account.sendMessage', [ada], { settings: armed }))

      expect(mocks.start).not.toHaveBeenCalled()
      expect(mocks.ask).toHaveBeenCalledWith('r1', 'n1', 'ada', '', 'DONE', {
         status: 'SKIPPED',
         reason: 'Written to in the last 24 hours.',
      })
   })

   it('should give each person what came of the message, UNKNOWN for one that may have gone', async () => {
      mocks.ofStep.mockResolvedValue([call('ada', 'ASKED', { ref: 'm-ada' }), call('bob', 'ASKED', { ref: 'm-bob' })])
      mocks.standing.mockResolvedValue(
         new Map([
            [
               'm-ada',
               {
                  status: 'DONE',
                  reason: null,
               },
            ],
            [
               'm-bob',
               {
                  status: 'UNSURE',
                  reason: 'No answer came from the browser.',
               },
            ],
         ])
      )

      const result = await sendMessages(context('account.sendMessage', [ada, bob], { settings: armed }))

      expect(mocks.settle).toHaveBeenCalledWith('c-bob', 'DONE', {
         status: 'UNKNOWN',
         reason: 'No answer came from the browser.',
      })
      expect(resultsOf()).toEqual({
         ada: 'SENT',
         bob: 'UNKNOWN',
      })
      expect(result).toMatchObject({
         status: 'PARTIAL',
         message: 'Sent 1 of 2: 1 not sent, see each result.',
      })
   })

   it("should leave a message for the next run at the account's daily limit, and wait when the queue is full", async () => {
      mocks.connectedVia.mockResolvedValue(
         new Map([
            ['ada', 'a1'],
            ['bob', 'a1'],
         ])
      )
      mocks.start
         .mockRejectedValueOnce(
            new mocks.TaskRefusedError('This account has sent 15 first messages in 24 hours. Try again later.')
         )
         .mockRejectedValueOnce(
            new mocks.TaskRefusedError('5 replies are already waiting to be sent from this account.')
         )
      mocks.ofStep.mockResolvedValueOnce([]).mockResolvedValue([
         call('ada', 'FAILED', {
            status: 'LEFT',
            reason: 'The account reached its limit for today. Left for the next run.',
         }),
      ])

      await expect(
         sendMessages(context('account.sendMessage', [ada, bob], { settings: armed }))
      ).rejects.toBeInstanceOf(Waiting)

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

   it('should leave what is not sent once the time limit passed, and fail when no account is signed in', async () => {
      mocks.ofStep.mockResolvedValue([call('ada', 'ASKED', { ref: 'm-ada' })])

      const late = await sendMessages(
         context('account.sendMessage', [ada], {
            startedAt: new Date(Date.now() - 9 * 60 * 60 * 1000),
            settings: armed,
         })
      )

      expect(mocks.start).not.toHaveBeenCalled()
      expect(late.status).toBe('PARTIAL')
      expect(resultsOf().ada).toBe('LEFT')

      mocks.ofStep.mockResolvedValue([])
      mocks.accounts.mockResolvedValue([
         {
            id: 'a1',
            status: 'PAUSED',
         },
      ])
      await expect(sendMessages(context('account.sendMessage', [ada], { settings: armed }))).rejects.toThrow(StepError)
   })
})

describe('replyToConversations', () => {
   it('should reply only where they wrote last, with the words filled in, and say why for the rest', async () => {
      mocks.conversations.mockResolvedValue([
         {
            id: 'c1',
            accountId: 'a1',
            lastDirection: 'THEM',
         },
         {
            id: 'c2',
            accountId: 'a1',
            lastDirection: 'ME',
         },
      ])
      mocks.companies.mockResolvedValue(new Map([['ada', 'Analytical Engines']]))
      mocks.ofStep
         .mockResolvedValueOnce([])
         .mockResolvedValue([call('c1', 'ASKED', { ref: 'm-c1' }), call('c2', 'DONE', { status: 'SKIPPED' }, '')])

      await expect(
         replyToConversations(
            context(
               'account.replyToConversation',
               [conversation('c1', 'Ada Lovelace', 'ada'), conversation('c2', 'Bob', null)],
               { settings: armed }
            )
         )
      ).rejects.toBeInstanceOf(Waiting)

      expect(mocks.send).toHaveBeenCalledTimes(1)
      expect(mocks.send).toHaveBeenCalledWith('u1', 'c1', 'Hi Ada at Analytical Engines')
      expect(mocks.ask).toHaveBeenCalledWith('r1', 'n1', 'c2', '', 'DONE', {
         status: 'SKIPPED',
         reason: 'They did not write last.',
      })
   })

   it('should reply where they did not write last when that guard is off, and skip a conversation written in lately', async () => {
      mocks.conversations.mockResolvedValue([
         {
            id: 'c1',
            accountId: 'a1',
            lastDirection: 'ME',
         },
         {
            id: 'c2',
            accountId: 'a1',
            lastDirection: 'ME',
         },
      ])
      mocks.recent.mockResolvedValue(new Set(['c2']))
      mocks.ofStep
         .mockResolvedValueOnce([])
         .mockResolvedValue([call('c1', 'ASKED', { ref: 'm-c1' }), call('c2', 'DONE', { status: 'SKIPPED' }, '')])

      await expect(
         replyToConversations(
            context('account.replyToConversation', [conversation('c1', 'Ada', null), conversation('c2', 'Bob', null)], {
               settings: {
                  ...armed,
                  onlyIfTheyWroteLast: false,
               },
            })
         )
      ).rejects.toBeInstanceOf(Waiting)

      expect(mocks.send).toHaveBeenCalledTimes(1)
      expect(mocks.ask).toHaveBeenCalledWith('r1', 'n1', 'c2', '', 'DONE', {
         status: 'SKIPPED',
         reason: 'Written in the last 24 hours.',
      })
   })

   it('should skip a conversation that is not the owner’s or not in the chosen accounts, and give what came of the rest', async () => {
      mocks.conversations.mockResolvedValue([
         {
            id: 'c1',
            accountId: 'a9',
            lastDirection: 'THEM',
         },
      ])
      mocks.ofStep.mockResolvedValueOnce([]).mockResolvedValue([
         call(
            'c1',
            'DONE',
            {
               status: 'SKIPPED',
               reason: 'Not in the chosen accounts.',
            },
            ''
         ),
         call(
            'c2',
            'DONE',
            {
               status: 'SKIPPED',
               reason: 'Not one of your conversations.',
            },
            ''
         ),
      ])

      const inputs = [conversation('c1', 'Ada', null), conversation('c2', 'Bob', null)]
      const result = await replyToConversations(context('account.replyToConversation', inputs, { settings: armed }))

      expect(mocks.send).not.toHaveBeenCalled()
      expect(resultsOf()).toEqual({
         c1: 'SKIPPED',
         c2: 'SKIPPED',
      })
      expect(result.status).toBe('PARTIAL')
   })
})
