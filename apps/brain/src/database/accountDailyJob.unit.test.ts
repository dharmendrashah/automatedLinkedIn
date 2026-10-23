import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AccountDailyJob } from './accountDailyJob'
import { TaskRefusedError, TaskUnavailableError } from './taskErrors'

const mocks = vi.hoisted(() => {
   const requestCheck = vi.fn()

   return {
      findMany: vi.fn(),
      updateMany: vi.fn(),
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
         },
      },
   },
}))
vi.mock('./linkedInAccountValidation.service', () => ({ LinkedInAccountValidationService: mocks.validation }))
vi.mock('./task.service', () => ({ TaskService: { request: mocks.requestTask } }))
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
   messagesReadAt: EARLIER,
   lastVerifiedAt: new Date('2026-10-18T20:00:00Z'),
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
const movedTo = (field: 'nextCheckAt' | 'nextBrowseAt' | 'nextMessagesAt') =>
   mocks.updateMany.mock.calls.filter(([{ data }]) => field in data).map(([{ data }]) => data[field])

describe('AccountDailyJob', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      mocks.updateMany.mockResolvedValue({ count: 1 })
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

   it('should ask for a full first read of the messages, and a short one on the later reads, the next in 2 hours', async () => {
      mocks.findMany.mockResolvedValue([
         account({
            nextMessagesAt: EARLIER,
            messagesReadAt: null,
         }),
      ])

      await expect(run()).resolves.toMatchObject({ reads: 1 })
      expect(mocks.requestTask).toHaveBeenCalledWith({
         userId: 'u1',
         task: 'linkedin-messages',
         accountId: 'acc1',
         trigger: 'automatic',
         input: { limit: 50 },
      })
      expect(movedTo('nextMessagesAt')).toEqual([IN_2_HOURS])

      mocks.requestTask.mockClear()
      mocks.findMany.mockResolvedValue([account({ nextMessagesAt: EARLIER })])
      await run()

      expect(mocks.requestTask).toHaveBeenCalledWith(
         expect.objectContaining({
            task: 'linkedin-messages',
            input: { limit: 20 },
         })
      )
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
