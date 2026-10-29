import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AccountDailyJob } from './accountDailyJob'
import { LinkedInAccountService } from './linkedInAccount.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

const mocks = vi.hoisted(() => {
   const requestCheck = vi.fn()

   return {
      requestCheck,
      requestTask: vi.fn(),
      validation: { request: requestCheck },
   }
})

vi.mock('./linkedInAccountValidation.service', () => ({ LinkedInAccountValidationService: mocks.validation }))
vi.mock('./task.service', () => ({
   TaskService: {
      request: mocks.requestTask,
      catalog: async () => [
         {
            task: 'linkedin-messages',
            version: 3,
         },
      ],
   },
}))

const email = `${randomUUID()}@elitale.com`
const NOW = new Date('2026-10-19T10:00:00Z')

const create = async (userId: string, data: Record<string, unknown>) => {
   const { id } = await LinkedInAccountService.create(userId, `${randomUUID()}@work.com`, { password: 'x' })

   return PrismaService.client.linkedInAccount.update({
      where: { id },
      data,
   })
}

describe('AccountDailyJob (database)', () => {
   beforeEach(() => {
      mocks.requestCheck.mockReset().mockResolvedValue(true)
      mocks.requestTask.mockReset().mockResolvedValue({ id: 's1' })
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should send what is due, draw first times, and leave paused or waiting accounts alone', async () => {
      const user = await UserService.create({ email })
      const due = await create(user.id, {
         status: 'ACTIVE',
         lastVerifiedAt: new Date('2026-10-18T20:00:00Z'),
         nextCheckAt: new Date('2026-10-19T09:00:00Z'),
         nextBrowseAt: new Date('2026-10-19T09:30:00Z'),
         profileAskedAt: new Date('2026-10-18T20:00:00Z'),
         invitationsReadAt: new Date('2026-10-18T20:00:00Z'),
         connectionsReadAt: new Date('2026-10-18T20:00:00Z'),
      })
      // Signed in and never read: its first reads come before its visit.
      const unread = await create(user.id, {
         status: 'ACTIVE',
         lastVerifiedAt: new Date('2026-10-19T09:00:00Z'),
         firstSignedInAt: new Date('2026-10-19T09:00:00Z'),
      })
      const fresh = await create(user.id, { status: 'ACTIVE' })
      const paused = await create(user.id, {
         status: 'DISABLED',
         nextCheckAt: new Date('2026-10-19T09:00:00Z'),
      })
      const waiting = await create(user.id, { status: 'NEEDS_REAUTH' })

      // Other test files may have accounts in the same database; only this user's are looked at.
      await AccountDailyJob.runDue(NOW, () => 0)

      const checked = mocks.requestCheck.mock.calls.map(([id]) => id)
      const visited = mocks.requestTask.mock.calls.map(([{ accountId }]) => accountId)

      expect(checked).toContain(due.id)
      expect(checked).not.toEqual(expect.arrayContaining([fresh.id]))
      expect(checked).not.toEqual(expect.arrayContaining([paused.id]))
      expect(checked).not.toEqual(expect.arrayContaining([waiting.id]))
      expect(visited).toContain(due.id)
      expect(visited).not.toEqual(expect.arrayContaining([fresh.id]))

      const rows = await PrismaService.client.linkedInAccount.findMany({
         where: { userId: user.id },
         select: {
            id: true,
            nextCheckAt: true,
            nextBrowseAt: true,
            nextFirstReadAt: true,
         },
      })
      const byId = new Map(rows.map(row => [row.id, row]))

      expect(visited).not.toEqual(expect.arrayContaining([unread.id]))
      expect(byId.get(unread.id)).toMatchObject({
         nextFirstReadAt: NOW,
         nextBrowseAt: null,
      })

      // No proxy country, so UTC: tomorrow at 08:00 for what was sent, a minute from now for a first time.
      expect(byId.get(due.id)).toMatchObject({
         nextCheckAt: new Date('2026-10-20T08:00:00Z'),
         nextBrowseAt: new Date('2026-10-20T08:00:00Z'),
      })
      expect(byId.get(fresh.id)).toMatchObject({
         nextCheckAt: new Date('2026-10-19T10:01:00Z'),
         nextBrowseAt: new Date('2026-10-19T10:01:00Z'),
      })
      expect(byId.get(paused.id)?.nextCheckAt).toEqual(new Date('2026-10-19T09:00:00Z'))
      expect(byId.get(waiting.id)).toMatchObject({
         nextCheckAt: null,
         nextBrowseAt: null,
      })
   })
})
