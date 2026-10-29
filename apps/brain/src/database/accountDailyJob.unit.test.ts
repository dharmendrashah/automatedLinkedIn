import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AccountDailyJob } from './accountDailyJob'
import { TaskRefusedError, TaskUnavailableError } from './taskErrors'

const mocks = vi.hoisted(() => {
   const requestCheck = vi.fn()

   return {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      updateAccount: vi.fn(),
      countSessions: vi.fn(),
      findSessions: vi.fn(),
      findConversations: vi.fn(),
      catalog: vi.fn(),
      requestCheck,
      requestTask: vi.fn(),
      validation: { request: requestCheck },
   }
})

vi.mock('./prisma.service', () => ({
   PrismaService: {
      client: {
         linkedInAccount: {
            findMany: mocks.findMany,
            updateMany: mocks.updateMany,
            update: mocks.updateAccount,
         },
         spiderSession: {
            count: mocks.countSessions,
            findMany: mocks.findSessions,
         },
         linkedInConversation: { findMany: mocks.findConversations },
      },
   },
}))
vi.mock('./linkedInAccountValidation.service', () => ({ LinkedInAccountValidationService: mocks.validation }))
vi.mock('./task.service', () => ({
   TaskService: {
      request: mocks.requestTask,
      catalog: mocks.catalog,
   },
}))
// The real time helpers without the rest of `core`, whose modules read the environment (DATABASE_URL) when they load.
vi.mock('core', async () => {
   const { dailyTime, timezoneOfCountry } = await import('../core/dailyTime')

   return {
      dailyTime,
      timezoneOfCountry,
   }
})

// 15:30 in India.
const NOW = new Date('2026-10-19T10:00:00Z')
const EARLIER = new Date('2026-10-19T09:00:00Z')
const LATER = new Date('2026-10-20T09:00:00Z')
const TOMORROW_8_IN_INDIA = new Date('2026-10-20T02:30:00Z')
const IN_2_HOURS = new Date('2026-10-19T12:00:00Z')

const account = (extra: Record<string, unknown> = {}) => ({
   id: 'acc1',
   userId: 'u1',
   status: 'ACTIVE',
   nextCheckAt: EARLIER,
   nextBrowseAt: EARLIER,
   // Not due, so the tests of the check and the visit stay about those.
   nextMessagesAt: LATER,
   nextInvitationsAt: LATER,
   // The first read is done and a sweep was made a moment ago, so the tests of the other jobs stay about those.
   messagesBackfilledAt: EARLIER,
   messagesSweptAt: NOW,
   messagesResumeSkip: null,
   lastVerifiedAt: new Date('2026-10-18T20:00:00Z'),
   // The first reads are done and the repeats are not due, so the other tests stay about their own jobs.
   firstSignedInAt: new Date('2026-10-01T09:00:00Z'),
   profileAskedAt: EARLIER,
   invitationsReadAt: EARLIER,
   connectionsReadAt: EARLIER,
   nextFirstReadAt: null,
   nextConnectionsAt: LATER,
   nextProfileAt: LATER,
   proxyServers: [
      {
         detectedCountryCode: 'IN',
         isPrimary: true,
         status: 'ACTIVE',
      },
   ],
   ...extra,
})

const run = () => AccountDailyJob.runDue(NOW, () => 0)
// What the worker announced for the messages task: a version that takes the rows brain knows, or an older one.
const announce = (version: number) =>
   mocks.catalog.mockResolvedValue([
      {
         task: 'linkedin-messages',
         version,
      },
   ])
const movedTo = (
   field:
      | 'nextCheckAt'
      | 'nextBrowseAt'
      | 'nextMessagesAt'
      | 'nextInvitationsAt'
      | 'nextFirstReadAt'
      | 'nextConnectionsAt'
      | 'nextProfileAt'
) => mocks.updateMany.mock.calls.filter(([{ data }]) => field in data).map(([{ data }]) => data[field])

describe('AccountDailyJob, the first day of a new account', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      mocks.updateMany.mockResolvedValue({ count: 1 })
      mocks.updateAccount.mockResolvedValue({})
      mocks.countSessions.mockResolvedValue(0)
      mocks.findSessions.mockResolvedValue([])
      mocks.findConversations.mockResolvedValue([])
      announce(3)
      mocks.requestCheck.mockResolvedValue(true)
      mocks.requestTask.mockResolvedValue({ id: 's1' })
   })

   // Signed in for the first time an hour ago; nothing read yet.
   const fresh = (extra: Record<string, unknown> = {}) =>
      account({
         firstSignedInAt: new Date('2026-10-19T09:00:00Z'),
         lastVerifiedAt: new Date('2026-10-19T09:00:00Z'),
         nextCheckAt: LATER,
         nextBrowseAt: null,
         nextMessagesAt: null,
         nextInvitationsAt: null,
         messagesBackfilledAt: null,
         profileAskedAt: null,
         invitationsReadAt: null,
         connectionsReadAt: null,
         nextConnectionsAt: null,
         nextProfileAt: null,
         nextFirstReadAt: EARLIER,
         ...extra,
      })
   const asked = () => mocks.requestTask.mock.calls.map(([options]) => options)

   it('should first wait a random moment, then ask for the own profile alone, allowed outside working hours on the first day', async () => {
      mocks.findMany.mockResolvedValue([fresh({ nextFirstReadAt: null })])

      await expect(AccountDailyJob.runDue(NOW, () => 0.5)).resolves.toMatchObject({ firstReads: 0 })
      expect(mocks.requestTask).not.toHaveBeenCalled()
      expect(movedTo('nextFirstReadAt')).toEqual([new Date('2026-10-19T10:10:00Z')])

      mocks.updateMany.mockClear()
      mocks.findMany.mockResolvedValue([fresh()])

      await expect(run()).resolves.toMatchObject({
         firstReads: 1,
         items: [
            {
               action: 'profile-read',
               result: 'ASKED',
               sessionId: 's1',
            },
         ],
      })
      expect(asked()).toEqual([
         {
            userId: 'u1',
            task: 'linkedin-profile',
            accountId: 'acc1',
            trigger: 'automatic',
            firstDay: true,
         },
      ])
      expect(movedTo('nextFirstReadAt')).toEqual([NOW])
      expect(movedTo('nextBrowseAt')).toEqual([])
   })

   it('should go on with the requests, then the connections, and start the daily read of the requests tomorrow', async () => {
      mocks.findMany.mockResolvedValue([fresh({ profileAskedAt: EARLIER })])

      await run()

      expect(asked()).toEqual([
         expect.objectContaining({
            task: 'linkedin-invitations',
            input: { answers: [] },
         }),
      ])
      expect(movedTo('nextInvitationsAt')).toEqual([TOMORROW_8_IN_INDIA])

      mocks.requestTask.mockClear()
      mocks.findMany.mockResolvedValue([
         fresh({
            profileAskedAt: EARLIER,
            invitationsReadAt: EARLIER,
         }),
      ])

      await run()

      expect(asked()).toEqual([
         expect.objectContaining({
            task: 'linkedin-connections',
            input: {},
            firstDay: true,
         }),
      ])
   })

   it('should leave a read tried today that did not finish for tomorrow, and go on with the next', async () => {
      mocks.findMany.mockResolvedValue([fresh()])
      mocks.findSessions.mockResolvedValue([{ task: 'linkedin-profile' }])

      await run()

      expect(asked()).toEqual([expect.objectContaining({ task: 'linkedin-invitations' })])
   })

   it('should start the first read of the messages at once when the other first reads were tried', async () => {
      mocks.findMany.mockResolvedValue([fresh()])
      mocks.findSessions.mockResolvedValue([
         { task: 'linkedin-profile' },
         { task: 'linkedin-invitations' },
         { task: 'linkedin-connections' },
      ])

      await expect(run()).resolves.toMatchObject({ reads: 1 })
      expect(asked()).toContainEqual(
         expect.objectContaining({
            task: 'linkedin-messages',
            firstDay: true,
         })
      )
   })

   it('should not let the reads of an account signed in long ago go outside working hours', async () => {
      mocks.findMany.mockResolvedValue([fresh({ firstSignedInAt: null })])

      await run()

      expect(asked()).toEqual([expect.not.objectContaining({ firstDay: true })])
   })

   it('should keep the time of a first read that was refused, and ask nothing else of the account meanwhile', async () => {
      mocks.findMany.mockResolvedValue([fresh()])
      mocks.requestTask.mockRejectedValue(new TaskRefusedError('This account is resting between two sessions.'))

      await expect(run()).resolves.toMatchObject({
         firstReads: 0,
         items: [
            {
               action: 'profile-read',
               result: 'SKIPPED',
               reason: 'This account is resting between two sessions.',
            },
         ],
      })
      expect(mocks.requestTask).toHaveBeenCalledTimes(1)
      expect(movedTo('nextFirstReadAt')).toEqual([])
   })

   it('should ask for nothing until the first sign-in is good', async () => {
      mocks.findMany.mockResolvedValue([fresh({ status: 'NEEDS_REAUTH' })])

      await run()

      expect(mocks.requestTask).not.toHaveBeenCalled()
   })

   it('should read the connections again a week and the own profile a month after, at a random time', async () => {
      mocks.findMany.mockResolvedValue([
         account({
            nextConnectionsAt: null,
            nextProfileAt: null,
         }),
      ])

      await run()

      expect(movedTo('nextConnectionsAt')).toEqual([new Date('2026-10-26T02:30:00Z')])
      expect(movedTo('nextProfileAt')).toEqual([new Date('2026-11-18T02:30:00Z')])

      mocks.updateMany.mockClear()
      mocks.requestTask.mockClear()
      mocks.findMany.mockResolvedValue([
         account({
            nextCheckAt: LATER,
            nextBrowseAt: LATER,
            nextConnectionsAt: EARLIER,
         }),
      ])

      await expect(run()).resolves.toMatchObject({
         repeatReads: 1,
         items: [
            {
               action: 'connections-read',
               result: 'ASKED',
            },
         ],
      })
      expect(asked()).toEqual([expect.objectContaining({ task: 'linkedin-connections' })])
      expect(asked()[0]).not.toHaveProperty('firstDay')
      expect(movedTo('nextConnectionsAt')).toEqual([new Date('2026-10-26T02:30:00Z')])
   })
})

describe('AccountDailyJob, the connection requests', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      mocks.updateMany.mockResolvedValue({ count: 1 })
      mocks.updateAccount.mockResolvedValue({})
      mocks.countSessions.mockResolvedValue(0)
      mocks.findConversations.mockResolvedValue([{ rowHash: 'aaaaaaaa' }])
      announce(3)
      mocks.requestCheck.mockResolvedValue(true)
      mocks.requestTask.mockResolvedValue({ id: 's1' })
   })

   const due = (extra: Record<string, unknown> = {}) =>
      account({
         nextCheckAt: LATER,
         nextBrowseAt: LATER,
         nextInvitationsAt: EARLIER,
         ...extra,
      })

   it('should ask for a read of the connection requests with no answers when it is due, then draw tomorrow in the account time zone', async () => {
      mocks.findMany.mockResolvedValue([due()])

      await expect(run()).resolves.toMatchObject({
         invitationReads: 1,
         visits: 0,
         reads: 0,
         items: [
            {
               accountId: 'acc1',
               action: 'invitations-read',
               result: 'ASKED',
               sessionId: 's1',
            },
         ],
      })
      expect(mocks.requestTask).toHaveBeenCalledTimes(1)
      expect(mocks.requestTask).toHaveBeenCalledWith({
         userId: 'u1',
         task: 'linkedin-invitations',
         accountId: 'acc1',
         trigger: 'automatic',
         input: { answers: [] },
      })
      expect(movedTo('nextInvitationsAt')).toEqual([TOMORROW_8_IN_INDIA])
   })

   it('should only draw a time, later today, for an account that has none yet', async () => {
      mocks.findMany.mockResolvedValue([due({ nextInvitationsAt: null })])

      await expect(run()).resolves.toMatchObject({
         invitationReads: 0,
         drawn: 1,
      })
      expect(mocks.requestTask).not.toHaveBeenCalled()
      expect(movedTo('nextInvitationsAt')).toEqual([new Date('2026-10-19T10:01:00Z')])
   })

   it('should keep the time of a read that could not be queued, so the next pass tries again', async () => {
      mocks.findMany.mockResolvedValue([due()])
      mocks.requestTask.mockRejectedValue(new TaskRefusedError('This account is outside its working hours.'))

      await expect(run()).resolves.toMatchObject({
         invitationReads: 0,
         items: [
            {
               action: 'invitations-read',
               result: 'SKIPPED',
               reason: 'This account is outside its working hours.',
            },
         ],
      })
      expect(movedTo('nextInvitationsAt')).toEqual([])
      expect(console.error).not.toHaveBeenCalled()
   })

   it('should log an unexpected failure without its details in the sentence, and try again on the next pass', async () => {
      mocks.findMany.mockResolvedValue([due()])
      mocks.requestTask.mockRejectedValue(new Error('connect ECONNREFUSED'))

      await expect(run()).resolves.toMatchObject({
         items: [
            {
               result: 'SKIPPED',
               reason: 'Could not be queued now, tried again on the next pass',
            },
         ],
      })
      expect(console.error).toHaveBeenCalled()
      expect(movedTo('nextInvitationsAt')).toEqual([])
   })

   it('should let the read go for the day, without asking, when there was no good sign-in in the last day', async () => {
      mocks.findMany.mockResolvedValue([due({ lastVerifiedAt: new Date('2026-10-18T09:00:00Z') })])

      await expect(run()).resolves.toMatchObject({ invitationReads: 0 })
      expect(mocks.requestTask).not.toHaveBeenCalled()
      expect(movedTo('nextInvitationsAt')).toEqual([TOMORROW_8_IN_INDIA])
   })

   it('should not ask for the read of an account that is not signed in', async () => {
      mocks.findMany.mockResolvedValue([due({ status: 'ERROR' })])

      await expect(run()).resolves.toMatchObject({ invitationReads: 0 })
      expect(mocks.requestTask).not.toHaveBeenCalled()
   })
})

describe('AccountDailyJob', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      mocks.updateMany.mockResolvedValue({ count: 1 })
      mocks.updateAccount.mockResolvedValue({})
      mocks.countSessions.mockResolvedValue(0)
      mocks.findConversations.mockResolvedValue([{ rowHash: 'aaaaaaaa' }])
      announce(3)
      mocks.requestCheck.mockResolvedValue(true)
      mocks.requestTask.mockResolvedValue({ id: 's1' })
   })

   it('should ask for the sign-in check and the visit that are due, then draw tomorrow in the account timezone', async () => {
      mocks.findMany.mockResolvedValue([account()])

      await expect(run()).resolves.toMatchObject({
         checks: 1,
         visits: 1,
         reads: 0,
      })

      expect(mocks.requestCheck).toHaveBeenCalledWith('acc1')
      expect(mocks.requestTask).toHaveBeenCalledWith({
         userId: 'u1',
         task: 'linkedin-browse',
         accountId: 'acc1',
         trigger: 'automatic',
      })
      expect(movedTo('nextCheckAt')).toEqual([TOMORROW_8_IN_INDIA])
      expect(movedTo('nextBrowseAt')).toEqual([TOMORROW_8_IN_INDIA])
   })

   it('should count a good sign-in of the last 12 hours as the check of the day', async () => {
      mocks.findMany.mockResolvedValue([account({ lastVerifiedAt: new Date('2026-10-19T09:30:00Z') })])

      await expect(run()).resolves.toMatchObject({ checks: 0 })

      expect(mocks.requestCheck).not.toHaveBeenCalled()
      expect(movedTo('nextCheckAt')).toEqual([TOMORROW_8_IN_INDIA])
   })

   it('should only draw a time, later today, for an account that has none yet', async () => {
      mocks.findMany.mockResolvedValue([
         account({
            nextCheckAt: null,
            nextBrowseAt: null,
         }),
      ])

      await run()

      expect(mocks.requestCheck).not.toHaveBeenCalled()
      expect(mocks.requestTask).not.toHaveBeenCalled()
      expect(movedTo('nextCheckAt')).toEqual([new Date('2026-10-19T10:01:00Z')])
   })

   it('should skip the visit of the day, without asking for it, when the last good sign-in is older than a day', async () => {
      mocks.findMany.mockResolvedValue([account({ lastVerifiedAt: new Date('2026-10-18T09:00:00Z') })])

      await expect(run()).resolves.toMatchObject({ visits: 0 })

      expect(mocks.requestTask).not.toHaveBeenCalled()
      expect(movedTo('nextBrowseAt')).toEqual([TOMORROW_8_IN_INDIA])
   })

   it('should check, but not visit, an account whose last check failed', async () => {
      mocks.findMany.mockResolvedValue([account({ status: 'ERROR' })])

      await expect(run()).resolves.toMatchObject({
         checks: 1,
         visits: 0,
         reads: 0,
      })
      expect(mocks.requestTask).not.toHaveBeenCalled()
   })

   it('should keep the time of a check or visit that could not be queued, so the next pass tries again', async () => {
      mocks.findMany.mockResolvedValue([account()])
      mocks.requestCheck.mockResolvedValue(false)
      mocks.requestTask.mockRejectedValue(new TaskRefusedError('A LinkedIn task is already running.'))

      await expect(run()).resolves.toMatchObject({
         checks: 0,
         visits: 0,
         reads: 0,
      })
      expect(mocks.updateMany).not.toHaveBeenCalled()
      expect(console.error).not.toHaveBeenCalled()
   })

   it('should list every account it was due for: asked with the session, or left with the reason', async () => {
      mocks.findMany.mockResolvedValue([
         account({
            id: 'asked',
            nextCheckAt: LATER,
            nextBrowseAt: LATER,
            nextMessagesAt: EARLIER,
         }),
         account({
            id: 'signed-out',
            nextCheckAt: LATER,
            nextBrowseAt: LATER,
            nextMessagesAt: EARLIER,
            lastVerifiedAt: new Date('2026-10-17T09:00:00Z'),
         }),
         account({
            id: 'busy',
            nextCheckAt: LATER,
            nextBrowseAt: LATER,
            nextMessagesAt: EARLIER,
         }),
      ])
      mocks.requestTask
         .mockResolvedValueOnce({ id: 's-asked' })
         .mockRejectedValueOnce(new TaskRefusedError('A LinkedIn task is already running.'))

      const { items, accounts, reads } = await run()

      expect(accounts).toBe(3)
      expect(reads).toBe(1)
      expect(items).toEqual([
         {
            userId: 'u1',
            accountId: 'asked',
            action: 'messages-read',
            result: 'ASKED',
            sessionId: 's-asked',
         },
         {
            userId: 'u1',
            accountId: 'signed-out',
            action: 'messages-read',
            result: 'SKIPPED',
            reason: 'Not signed in successfully in the last day',
         },
         {
            userId: 'u1',
            accountId: 'busy',
            action: 'messages-read',
            result: 'SKIPPED',
            reason: 'A LinkedIn task is already running.',
         },
      ])
   })

   it('should say the check was let go when a recent sign-in counted for it', async () => {
      mocks.findMany.mockResolvedValue([account({ lastVerifiedAt: new Date('2026-10-19T09:30:00Z') })])

      const { items } = await run()

      expect(items).toContainEqual({
         userId: 'u1',
         accountId: 'acc1',
         action: 'sign-in-check',
         result: 'SKIPPED',
         reason: 'Signed in successfully in the last 12 hours, which counts as the check',
      })
   })

   it('should say nothing while the worker does not know the visit yet', async () => {
      mocks.findMany.mockResolvedValue([account()])
      mocks.requestTask.mockRejectedValue(new TaskUnavailableError())

      await run()

      expect(console.error).not.toHaveBeenCalled()
   })

   it('should walk the whole inbox in batches the first time, and stop at the rows it knows on the later reads, the next in 2 hours', async () => {
      mocks.findMany.mockResolvedValue([
         account({
            nextMessagesAt: EARLIER,
            messagesBackfilledAt: null,
         }),
      ])

      await expect(run()).resolves.toMatchObject({ reads: 1 })
      expect(mocks.requestTask).toHaveBeenCalledWith({
         userId: 'u1',
         task: 'linkedin-messages',
         accountId: 'acc1',
         trigger: 'automatic',
         input: {
            limit: 50,
            known: ['aaaaaaaa'],
         },
      })
      expect(movedTo('nextMessagesAt')).toEqual([IN_2_HOURS])

      mocks.requestTask.mockClear()
      mocks.findMany.mockResolvedValue([account({ nextMessagesAt: EARLIER })])
      await run()

      expect(mocks.requestTask).toHaveBeenCalledWith(
         expect.objectContaining({
            task: 'linkedin-messages',
            input: {
               limit: 50,
               known: ['aaaaaaaa'],
               stopAfterKnown: 3,
            },
         })
      )
   })

   it('should send the input an older spider knows while the worker has not announced the new version', async () => {
      announce(2)
      mocks.findMany.mockResolvedValue([
         account({
            nextMessagesAt: EARLIER,
            messagesBackfilledAt: null,
         }),
      ])

      await run()

      expect(mocks.requestTask).toHaveBeenCalledWith(expect.objectContaining({ input: { limit: 50 } }))
   })

   it('should go on from the place a read stopped at, in the first read and in a later one', async () => {
      mocks.findMany.mockResolvedValue([
         account({
            nextMessagesAt: EARLIER,
            messagesResumeSkip: 14,
         }),
      ])

      await run()

      expect(mocks.requestTask).toHaveBeenCalledWith({
         userId: 'u1',
         task: 'linkedin-messages',
         accountId: 'acc1',
         trigger: 'automatic',
         input: {
            skip: 14,
            limit: 50,
            known: ['aaaaaaaa'],
            stopAfterKnown: 3,
         },
      })
   })

   it('should do at most five batches of the first read in a day, and let the sixth go until later', async () => {
      mocks.findMany.mockResolvedValue([
         account({
            nextMessagesAt: EARLIER,
            messagesBackfilledAt: null,
         }),
      ])
      mocks.countSessions.mockResolvedValue(4)

      await expect(run()).resolves.toMatchObject({ reads: 1 })
      expect(mocks.countSessions.mock.calls[0]?.[0]).toMatchObject({
         where: {
            linkedInAccountId: 'acc1',
            task: 'linkedin-messages',
            trigger: 'automatic',
         },
      })

      mocks.requestTask.mockClear()
      mocks.countSessions.mockResolvedValue(5)

      const { reads, items } = await run()

      expect(reads).toBe(0)
      expect(mocks.requestTask).not.toHaveBeenCalledWith(expect.objectContaining({ task: 'linkedin-messages' }))
      expect(items).toContainEqual(
         expect.objectContaining({
            result: 'SKIPPED',
            reason: 'The first read of the messages has done its batches for today and goes on later',
         })
      )
   })

   it('should not count sessions for an account whose first read is done', async () => {
      mocks.findMany.mockResolvedValue([account({ nextMessagesAt: EARLIER })])

      await run()

      expect(mocks.countSessions).not.toHaveBeenCalled()
   })

   it('should sweep the newest 20 once a day, leaving the rows brain knows alone, and write down that it did', async () => {
      mocks.findMany.mockResolvedValue([
         account({
            nextMessagesAt: EARLIER,
            messagesSweptAt: new Date('2026-10-18T09:00:00Z'),
         }),
      ])

      await run()

      expect(mocks.requestTask).toHaveBeenCalledWith(
         expect.objectContaining({ input: expect.objectContaining({ limit: 20 }) })
      )
      expect(mocks.updateAccount).toHaveBeenCalledWith({
         where: { id: 'acc1' },
         data: { messagesSweptAt: NOW },
      })
   })

   it('should not write down a sweep that could not be queued', async () => {
      mocks.findMany.mockResolvedValue([
         account({
            nextMessagesAt: EARLIER,
            messagesSweptAt: new Date('2026-10-18T09:00:00Z'),
         }),
      ])
      mocks.requestTask.mockRejectedValue(new TaskRefusedError('A LinkedIn task is already running.'))

      await run()

      expect(mocks.updateAccount).not.toHaveBeenCalled()
   })

   it('should let a read go when there was no good sign-in in the last day, and keep its time when it cannot be queued', async () => {
      mocks.findMany.mockResolvedValue([
         account({
            nextMessagesAt: EARLIER,
            lastVerifiedAt: new Date('2026-10-18T09:00:00Z'),
         }),
      ])

      await expect(run()).resolves.toMatchObject({ reads: 0 })
      expect(mocks.requestTask).not.toHaveBeenCalledWith(expect.objectContaining({ task: 'linkedin-messages' }))
      expect(movedTo('nextMessagesAt')).toEqual([IN_2_HOURS])

      mocks.updateMany.mockClear()
      mocks.findMany.mockResolvedValue([account({ nextMessagesAt: EARLIER })])
      mocks.requestTask.mockRejectedValue(new TaskRefusedError('A LinkedIn task is already running.'))

      await expect(run()).resolves.toMatchObject({ reads: 0 })
      expect(movedTo('nextMessagesAt')).toEqual([])
   })

   it('should use UTC for an account without a known proxy country', async () => {
      mocks.findMany.mockResolvedValue([account({ proxyServers: [] })])

      await run()

      expect(movedTo('nextCheckAt')).toEqual([new Date('2026-10-20T08:00:00Z')])
   })

   it('should move a time only when no other run moved it first', async () => {
      mocks.findMany.mockResolvedValue([account()])

      await run()

      expect(mocks.updateMany).toHaveBeenCalledWith({
         where: {
            id: 'acc1',
            nextCheckAt: EARLIER,
         },
         data: { nextCheckAt: TOMORROW_8_IN_INDIA },
      })
   })
})
