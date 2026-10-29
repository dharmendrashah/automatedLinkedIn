import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { KeptFiles } from 'core'

import { FirstDayUsedService } from './firstDayUsed.service'
import { LinkedInAccountService } from './linkedInAccount.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL.

const email = `${randomUUID()}@elitale.com`
let userId: string

const account = async (data: Record<string, unknown>) => {
   const login = `${randomUUID()}@work.com`
   const { id } = await LinkedInAccountService.create(userId, login, { password: 'x' })

   await PrismaService.client.linkedInAccount.update({
      where: { id },
      data,
   })

   return {
      id,
      login,
   }
}

const session = (accountId: string, task: string, status: 'IN_PROGRESS' | 'SUCCEEDED', startedAt = new Date()) =>
   PrismaService.client.spiderSession.create({
      data: {
         id: randomUUID(),
         userId,
         linkedInAccountId: accountId,
         kind: 'TASK',
         task,
         trigger: 'automatic',
         requestParams: {},
         status,
         startedAt,
      },
   })

const loadingOfAccount = async (id: string) =>
   (await LinkedInAccountService.listForUser(userId)).find(item => item.id === id)?.loading

describe('Getting your LinkedIn ready (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      // Removing an account removes its kept files in the bucket; there is none here.
      vi.spyOn(KeptFiles, 'removeAccount').mockResolvedValue(undefined)
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should give each account its loading: what is done, being read, did not finish, and the messages read so far', async () => {
      const now = new Date()
      const { id } = await account({
         status: 'ACTIVE',
         firstSignedInAt: now,
         lastVerifiedAt: now,
         invitationsReadAt: now,
      })

      await session(id, 'linkedin-connections', 'IN_PROGRESS')
      await session(id, 'linkedin-profile', 'SUCCEEDED')
      await PrismaService.client.linkedInConversation.createMany({
         data: Array.from({ length: 150 }, (_, index) => ({
            userId,
            accountId: id,
            linkedInId: `2-${index}`,
            title: `Person ${index}`,
            kind: 'DIRECT' as const,
            participants: [],
            unread: false,
            complete: true,
         })),
      })

      expect(await loadingOfAccount(id)).toEqual({
         // Sign-in 10, requests 20, and half of the 40 for the messages.
         percent: 50,
         steps: [
            {
               step: 'SIGN_IN',
               weight: 10,
               state: 'DONE',
            },
            {
               step: 'PROFILE',
               weight: 10,
               state: 'NOT_FINISHED',
            },
            {
               step: 'CONNECTIONS',
               weight: 20,
               state: 'READING',
            },
            {
               step: 'REQUESTS',
               weight: 20,
               state: 'DONE',
            },
            {
               step: 'MESSAGES',
               weight: 40,
               state: 'WAITING',
            },
         ],
         conversations: 150,
         readyForWorkflows: false,
         readyForUnibox: false,
      })
   })

   it('should count an account signed in before this change as signed in, and an account never signed in at 0 %', async () => {
      const older = await account({
         status: 'ACTIVE',
         lastVerifiedAt: new Date(),
      })
      const fresh = await account({})

      expect((await loadingOfAccount(older.id))?.percent).toBe(10)
      expect((await loadingOfAccount(fresh.id))?.percent).toBe(0)
   })

   it('should remember a removed login that had its first day for 30 days, as a hash only', async () => {
      const { id, login } = await account({
         status: 'ACTIVE',
         firstSignedInAt: new Date(),
      })
      const never = await account({})

      await LinkedInAccountService.deleteForUser(userId, id)
      await LinkedInAccountService.deleteForUser(userId, never.id)

      await expect(FirstDayUsedService.used(userId, login.toUpperCase())).resolves.toBe(true)
      await expect(FirstDayUsedService.used(userId, never.login)).resolves.toBe(false)
      await expect(FirstDayUsedService.used(randomUUID(), login)).resolves.toBe(false)

      const rows = await PrismaService.client.firstDayUsed.findMany({ where: { userId } })

      expect(JSON.stringify(rows)).not.toContain(login)

      const later = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000)

      await expect(FirstDayUsedService.used(userId, login, later)).resolves.toBe(false)
      await FirstDayUsedService.sweep(later)
      await expect(PrismaService.client.firstDayUsed.count({ where: { userId } })).resolves.toBe(0)
   })
})
