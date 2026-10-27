import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AccountTodayService } from './accountToday.service'

const mocks = vi.hoisted(() => ({
   findAccounts: vi.fn(),
   findSessions: vi.fn(),
}))

vi.mock('./prisma.service', () => ({
   PrismaService: {
      client: {
         linkedInAccount: { findMany: mocks.findAccounts },
         spiderSession: { findMany: mocks.findSessions },
      },
   },
}))

const NOW = new Date('2026-10-27T12:00:00Z')
const at = (time: string) => new Date(`2026-10-27T${time}:00Z`)

const account = (id: string, patch: Record<string, unknown> = {}) => ({
   id,
   nextCheckAt: null,
   nextBrowseAt: at('18:00'),
   nextMessagesAt: at('14:00'),
   nextInvitationsAt: null,
   messagesBackfilledAt: new Date(),
   ...patch,
})

const session = (
   id: string,
   accountId: string,
   task: string | null,
   time: string,
   patch: Record<string, unknown> = {}
) => ({
   id,
   linkedInAccountId: accountId,
   task,
   kind: task ? 'TASK' : 'VALIDATE_ACCOUNT',
   status: 'SUCCEEDED',
   verdict: 'DONE',
   trigger: 'automatic',
   startedAt: at(time),
   finishedAt: at(time),
   dispatch: null,
   ...patch,
})

describe('AccountTodayService', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should answer nothing, and ask nothing more, for an owner with no account', async () => {
      mocks.findAccounts.mockResolvedValueOnce([])

      await expect(AccountTodayService.forUser('u1', NOW)).resolves.toEqual([])
      expect(mocks.findSessions).not.toHaveBeenCalled()
   })

   it('should give each account its four items with the next time, the newest run and the newest good run', async () => {
      mocks.findAccounts.mockResolvedValueOnce([account('a1', { messagesBackfilledAt: null })])
      mocks.findSessions
         .mockResolvedValueOnce([
            session('s3', 'a1', 'linkedin-messages', '11:00', {
               status: 'FAILED',
               verdict: 'ERROR',
            }),
            session('s2', 'a1', 'linkedin-browse', '02:40', {
               status: 'IN_PROGRESS',
               verdict: null,
               dispatch: { sessionId: 'd' },
            }),
         ])
         .mockResolvedValueOnce([session('s1', 'a1', 'linkedin-messages', '09:00')])

      const [first] = await AccountTodayService.forUser('u1', NOW)

      expect(first?.firstRead).toBe(true)
      expect(first?.items.map(({ item }) => item)).toEqual(['login', 'visit', 'messages', 'network'])
      expect(first?.items[0]).toMatchObject({
         item: 'login',
         next: null,
         last: null,
         lastOk: null,
      })
      expect(first?.items[1]).toMatchObject({
         next: at('18:00'),
         last: {
            id: 's2',
            status: 'IN_PROGRESS',
            queued: true,
         },
         lastOk: null,
      })
      expect(first?.items[2]).toMatchObject({
         next: at('14:00'),
         last: {
            id: 's3',
            status: 'FAILED',
            queued: false,
         },
         lastOk: {
            id: 's1',
            status: 'SUCCEEDED',
         },
      })
   })

   it('should take the newest of the two kinds of row a login check can leave', async () => {
      mocks.findAccounts.mockResolvedValueOnce([account('a1')])
      mocks.findSessions
         .mockResolvedValueOnce([session('new', 'a1', 'linkedin-login', '10:00'), session('old', 'a1', null, '08:00')])
         .mockResolvedValueOnce([])

      const [first] = await AccountTodayService.forUser('u1', NOW)

      expect(first?.items[0]?.last?.id).toBe('new')
   })

   it('should ask once for every account, owner scoped, in the last 30 days, and never one query per account', async () => {
      mocks.findAccounts.mockResolvedValueOnce(['a1', 'a2', 'a3'].map(id => account(id)))
      mocks.findSessions.mockResolvedValue([])

      await AccountTodayService.forUser('u1', NOW)

      expect(mocks.findSessions).toHaveBeenCalledTimes(2)
      expect(mocks.findSessions.mock.calls[0]?.[0].where).toMatchObject({
         userId: 'u1',
         linkedInAccountId: { in: ['a1', 'a2', 'a3'] },
         startedAt: { gte: new Date('2026-09-27T12:00:00Z') },
      })
      expect(mocks.findSessions.mock.calls[1]?.[0].where).toMatchObject({ status: 'SUCCEEDED' })
   })
})
