import { beforeEach, describe, expect, it, vi } from 'vitest'

import { person } from 'core/workflowItem'

import { type Graph } from '@automatedLinkedIn/contracts'

import { type Context, StepError } from './context'
import { sendInvites, withdrawInvites } from './inviteBlocks'

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
      inviteFrom: vi.fn(),
      withdraw: vi.fn(),
      replaceItems: vi.fn(),
      factsFor: vi.fn(),
      accountNames: vi.fn(),
      roomToday: vi.fn(),
   }
})

vi.mock('env', () => ({}))

vi.mock('core', async () => ({
   ...(await vi.importActual<object>('core/workflowItem')),
   ...(await vi.importActual<object>('core/templateValues')),
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
   RoomTodayService: { forAccounts: mocks.roomToday },
   WorkflowListService: { seenAmong: mocks.seenAmong },
   AccountActionService: {
      ofStep: mocks.ofStep,
      ask: mocks.ask,
   },
   LinkedInInviteService: {
      inviteFrom: mocks.inviteFrom,
      withdraw: mocks.withdraw,
   },
   WorkflowRunService: { replaceItems: mocks.replaceItems },
   MessageValuesService: {
      factsFor: mocks.factsFor,
      accountFirstNames: mocks.accountNames,
   },
   IcpService: {},
   WalletService: {},
   floorMicros: () => 0,
}))

type BlockType = 'account.sendInvite' | 'account.withdrawInvite'

const graph = (type: BlockType, settings: Record<string, string | boolean | number> = {}, pool?: string[]): Graph => ({
   nodes: [
      ...(pool
         ? [
              {
                 id: 'pool',
                 type: 'account.select' as const,
                 config: { accounts: pool },
                 position: {
                    x: 0,
                    y: 0,
                 },
              },
           ]
         : []),
      {
         id: 'n1',
         type,
         config: pool
            ? settings
            : {
                 accountMode: 'one',
                 account: 'a1',
                 ...settings,
              },
         position: {
            x: 0,
            y: 100,
         },
      },
   ],
   edges: pool
      ? [
           {
              from: 'pool',
              to: 'n1',
           },
        ]
      : [],
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
})

const context = (
   type: BlockType,
   overrides: { preview?: boolean; settings?: Record<string, string | boolean | number>; pool?: string[] } = {}
) => {
   const built = graph(type, overrides.settings, overrides.pool)

   return {
      run: {
         id: 'r1',
         userId: 'u1',
         startedAt: new Date(),
         stopRequestedAt: null,
      },
      graph: built,
      node: built.nodes.find(({ id }) => id === 'n1'),
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

const resultsOf = () =>
   Object.fromEntries(
      (
         mocks.replaceItems.mock.calls[0]?.[1] as { slug: string; result: { status: string; reason: string | null } }[]
      ).map(item => [item.slug, item.result.status])
   )

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
   mocks.factsFor.mockResolvedValue(new Map())
   mocks.accountNames.mockResolvedValue(new Map())
   mocks.roomToday.mockImplementation(async (_user: string, ids: string[]) =>
      ids.map(accountId => ({
         accountId,
         name: accountId,
         signedIn: true,
         left: 10,
         limit: 15,
         within: 10,
         paused: false,
      }))
   )
})

describe('sendInvites', () => {
   const armed = { settings: { actForReal: true } }

   it('should plan nothing in a preview, or while Act for real is off', async () => {
      const preview = await sendInvites(
         context('account.sendInvite', {
            ...armed,
            preview: true,
         })
      )

      expect(preview.message).toBe('A preview sends nothing.')
      expect(resultsOf()).toEqual({
         ada: 'NOT_ASKED',
         bob: 'NOT_ASKED',
      })

      const off = await sendInvites(context('account.sendInvite'))

      expect(off.message).toContain('Act for real is off')
      expect(mocks.inviteFrom).not.toHaveBeenCalled()
   })

   it('should plan the people through the invite planner and say on each one when it goes or why not', async () => {
      const plannedAt = new Date('2026-11-03T09:00:00.000Z')

      mocks.seenAmong.mockResolvedValue(new Set(['bob']))
      mocks.inviteFrom.mockResolvedValue({
         outcomes: [
            {
               slug: 'ada',
               state: 'QUEUED',
               reason: null,
               plannedAt,
            },
         ],
      })

      const result = await sendInvites(
         context('account.sendInvite', {
            settings: {
               actForReal: true,
               note: 'Hi {first_name}',
            },
         })
      )

      expect(mocks.inviteFrom).toHaveBeenCalledWith(
         'u1',
         'a1',
         [
            {
               slug: 'ada',
               name: 'Ada Lovelace',
               company: 'Analytical Engines',
            },
         ],
         'Hi {first_name}',
         expect.any(Date),
         expect.objectContaining({
            runId: 'r1',
            nodeId: 'n1',
         }),
         1
      )
      expect(mocks.ask).toHaveBeenCalledWith('r1', 'n1', 'ada', 'a1', 'DONE', {
         status: 'PLANNED',
         reason: null,
         at: plannedAt.toISOString(),
      })
      expect(resultsOf()).toEqual({
         ada: 'PLANNED',
         bob: 'SKIPPED',
      })
      expect(result.status).toBe('PARTIAL')
   })

   it('should leave out a person with no value for a variable of the note, when asked to, and say which', async () => {
      mocks.inviteFrom.mockResolvedValue({
         outcomes: [
            {
               slug: 'ada',
               state: 'QUEUED',
               reason: null,
               plannedAt: new Date('2026-11-03T09:00:00.000Z'),
            },
         ],
      })

      await sendInvites(
         context('account.sendInvite', {
            settings: {
               actForReal: true,
               skipMissing: true,
               note: 'Hi {first_name}, how is {company}?',
            },
         })
      )

      expect(mocks.inviteFrom.mock.calls[0]?.[2]).toEqual([
         {
            slug: 'ada',
            name: 'Ada Lovelace',
            company: 'Analytical Engines',
         },
      ])
      expect(resultsOf()).toMatchObject({ bob: 'SKIPPED' })
   })

   it('should not plan again what an earlier pass of the step already planned', async () => {
      mocks.ofStep.mockResolvedValue([
         {
            id: 'c1',
            slug: 'ada',
            accountId: 'a1',
            state: 'DONE',
            result: {
               status: 'PLANNED',
               at: '2026-11-03T09:00:00.000Z',
            },
            createdAt: new Date(),
         },
         {
            id: 'c2',
            slug: 'bob',
            accountId: 'a1',
            state: 'DONE',
            result: {
               status: 'SKIPPED',
               reason: 'Already connected.',
            },
            createdAt: new Date(),
         },
      ])

      await sendInvites(context('account.sendInvite', armed))

      expect(mocks.inviteFrom).not.toHaveBeenCalled()
      expect(resultsOf()).toEqual({
         ada: 'PLANNED',
         bob: 'SKIPPED',
      })
   })

   it('should give the people to the accounts in turn, and leave them when an account cannot send', async () => {
      mocks.accounts.mockResolvedValue([
         {
            id: 'a1',
            status: 'ACTIVE',
         },
         {
            id: 'a2',
            status: 'ACTIVE',
         },
      ])
      mocks.inviteFrom.mockImplementation(async (_user: string, account: string, people: { slug: string }[]) => {
         if (account === 'a2') {
            throw new mocks.TaskRefusedError('Inviting needs a signed-in account.')
         }

         return {
            outcomes: people.map(({ slug }) => ({
               slug,
               state: 'QUEUED',
               reason: null,
               plannedAt: new Date(),
            })),
         }
      })

      const result = await sendInvites(
         context('account.sendInvite', {
            settings: { actForReal: true },
            pool: ['a1', 'a2'],
         })
      )

      expect(
         mocks.inviteFrom.mock.calls.map(([, account, people]) => [
            account,
            people.map((one: { slug: string }) => one.slug),
         ])
      ).toEqual([
         ['a1', ['ada']],
         ['a2', ['bob']],
      ])
      expect(resultsOf()).toEqual({
         ada: 'PLANNED',
         bob: 'LEFT',
      })
      expect(result.status).toBe('PARTIAL')
   })

   it('should give more people to the account with more room, pass the days ahead, and leave out what no room holds', async () => {
      mocks.accounts.mockResolvedValue([
         {
            id: 'a1',
            status: 'ACTIVE',
         },
         {
            id: 'a2',
            status: 'ACTIVE',
         },
      ])
      mocks.roomToday.mockResolvedValue([
         {
            accountId: 'a1',
            name: 'Sam',
            signedIn: true,
            left: 1,
            limit: 15,
            within: 1,
            paused: false,
         },
         {
            accountId: 'a2',
            name: 'Ada',
            signedIn: true,
            left: 0,
            limit: 15,
            within: 0,
            paused: false,
         },
      ])
      mocks.inviteFrom.mockImplementation(async (_user: string, _account: string, people: { slug: string }[]) => ({
         outcomes: people.map(({ slug }) => ({
            slug,
            state: 'QUEUED',
            reason: null,
            plannedAt: new Date(),
         })),
      }))

      const result = await sendInvites(
         context('account.sendInvite', {
            settings: {
               actForReal: true,
               planDays: 3,
            },
            pool: ['a1', 'a2'],
         })
      )

      expect(mocks.roomToday).toHaveBeenCalledWith('u1', ['a1', 'a2'], 'invite', expect.any(Date), 3)
      expect(mocks.inviteFrom).toHaveBeenCalledTimes(1)
      expect(mocks.inviteFrom.mock.calls[0]?.[1]).toBe('a1')
      expect(mocks.inviteFrom.mock.calls[0]?.[6]).toBe(3)
      expect(resultsOf()).toEqual({
         ada: 'PLANNED',
         bob: 'SKIPPED',
      })
      expect(result.message).toContain('Room today: Sam 1 of 15 left, Ada 0 of 15 left.')
   })

   it('should say too many pending invites when every account is paused', async () => {
      mocks.roomToday.mockResolvedValue([
         {
            accountId: 'a1',
            name: 'Sam',
            signedIn: true,
            left: 0,
            limit: 15,
            within: 0,
            paused: true,
         },
      ])

      await sendInvites(context('account.sendInvite', armed))

      const reasons = (mocks.replaceItems.mock.calls[0]?.[1] as { result: { reason: string } }[]).map(
         ({ result }) => result.reason
      )

      expect(mocks.inviteFrom).not.toHaveBeenCalled()
      expect(reasons).toEqual(['Too many pending invites.', 'Too many pending invites.'])
   })

   it('should fail when no chosen account is signed in', async () => {
      mocks.accounts.mockResolvedValue([
         {
            id: 'a1',
            status: 'PAUSED',
         },
      ])

      await expect(sendInvites(context('account.sendInvite', armed))).rejects.toThrow(StepError)
   })
})

describe('withdrawInvites', () => {
   it('should take back nothing in a preview', async () => {
      const result = await withdrawInvites(context('account.withdrawInvite', { preview: true }))

      expect(result.message).toBe('A preview withdraws nothing.')
      expect(mocks.withdraw).not.toHaveBeenCalled()
   })

   it('should cancel an invite that had not gone, queue a sent one, and skip a person with none pending', async () => {
      mocks.withdraw.mockResolvedValue(
         new Map([
            [
               'ada',
               {
                  accountId: 'a1',
                  taken: 'QUEUED',
               },
            ],
         ])
      )

      const result = await withdrawInvites(context('account.withdrawInvite'))

      expect(mocks.withdraw).toHaveBeenCalledWith('u1', ['a1'], ['ada', 'bob'])
      expect(resultsOf()).toEqual({
         ada: 'PLANNED',
         bob: 'SKIPPED',
      })
      expect(result).toMatchObject({
         status: 'PARTIAL',
         message: "Took back 1 of 2 connection requests; 1 had none pending, see each person's result.",
      })

      mocks.replaceItems.mockClear()
      mocks.withdraw.mockResolvedValue(
         new Map([
            [
               'ada',
               {
                  accountId: 'a1',
                  taken: 'CANCELLED',
               },
            ],
            [
               'bob',
               {
                  accountId: 'a1',
                  taken: 'QUEUED',
               },
            ],
         ])
      )

      const all = await withdrawInvites(context('account.withdrawInvite'))

      expect(resultsOf()).toEqual({
         ada: 'CANCELLED',
         bob: 'PLANNED',
      })
      expect(all.status).toBe('DONE')
   })
})
