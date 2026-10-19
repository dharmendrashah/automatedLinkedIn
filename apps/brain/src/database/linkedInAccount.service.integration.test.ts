import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import { LinkedInAccountConflictError, LinkedInAccountService } from './linkedInAccount.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`
const linkedIn = 'ada@work.com'

describe('LinkedInAccountService (database)', () => {
   afterAll(async () => {
      // Deleting the users cascades to their LinkedIn accounts.
      await PrismaService.client.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })

      await PrismaService.disconnect()
   })

   it('should store secrets encrypted, default to PENDING and never return secret columns', async () => {
      const user = await UserService.create({ email })

      const created = await LinkedInAccountService.create(user.id, linkedIn, {
         password: 'hunter2',
         totpSecret: 'JBSWY3DPEHPK3PXP',
      })

      expect(created).toMatchObject({
         email: linkedIn,
         hasPassword: true,
         hasTotp: true,
         hasSession: false,
         status: 'PENDING',
         statusMessage: null,
         lastVerifiedAt: null,
      })
      expect(created).not.toHaveProperty('secret')

      const raw = await PrismaService.client.linkedInAccount.findUniqueOrThrow({ where: { id: created.id } })

      expect(JSON.stringify(raw)).not.toContain('hunter2')
      expect(JSON.stringify(raw)).not.toContain('JBSWY3DPEHPK3PXP')

      await expect(LinkedInAccountService.revealForUser(user.id, created.id)).resolves.toEqual({
         email: linkedIn,
         secrets: {
            password: 'hunter2',
            totpSecret: 'JBSWY3DPEHPK3PXP',
         },
      })
   })

   it('should reject the same LinkedIn email twice for one user', async () => {
      const user = await UserService.findByEmail(email)

      await expect(LinkedInAccountService.create(user!.id, linkedIn, { password: 'x' })).rejects.toBeInstanceOf(
         LinkedInAccountConflictError
      )
   })

   it('should never expose an account to another user', async () => {
      const owner = await UserService.findByEmail(email)
      const other = await UserService.create({ email: otherEmail })
      const [account] = await LinkedInAccountService.listForUser(owner!.id)

      await expect(LinkedInAccountService.listForUser(other.id)).resolves.toEqual([])
      await expect(LinkedInAccountService.getForUser(other.id, account.id)).resolves.toBeNull()
      await expect(LinkedInAccountService.revealForUser(other.id, account.id)).resolves.toBeNull()
      await expect(LinkedInAccountService.setPausedForUser(other.id, account.id, true)).resolves.toBeNull()
      await expect(LinkedInAccountService.deleteForUser(other.id, account.id)).resolves.toBe(false)
   })

   it('should pause, resume and keep a paused account paused when its secrets change', async () => {
      const owner = await UserService.findByEmail(email)
      const [account] = await LinkedInAccountService.listForUser(owner!.id)

      await expect(LinkedInAccountService.setPausedForUser(owner!.id, account.id, true)).resolves.toMatchObject({
         status: 'DISABLED',
         statusMessage: 'Paused by you',
      })

      await expect(
         LinkedInAccountService.updateForUser(owner!.id, account.id, { secrets: { password: 'new-pass' } })
      ).resolves.toMatchObject({ status: 'DISABLED' })

      await expect(LinkedInAccountService.setPausedForUser(owner!.id, account.id, false)).resolves.toMatchObject({
         status: 'PENDING',
         statusMessage: null,
      })
   })

   it('should reset a verified account to PENDING when its secrets change', async () => {
      const owner = await UserService.findByEmail(email)
      const [account] = await LinkedInAccountService.listForUser(owner!.id)

      await PrismaService.client.linkedInAccount.update({
         where: { id: account.id },
         data: {
            status: 'ACTIVE',
            lastVerifiedAt: new Date(),
         },
      })

      await expect(
         LinkedInAccountService.updateForUser(owner!.id, account.id, { secrets: { session: 'li_at=abc' } })
      ).resolves.toMatchObject({
         status: 'PENDING',
         lastVerifiedAt: null,
         hasSession: true,
      })
   })

   it('should list the newest visit of each account, and no other task or user', async () => {
      const owner = await UserService.findByEmail(email)
      const [account] = await LinkedInAccountService.listForUser(owner!.id)

      expect(account.lastVisit).toBeNull()

      const session = (id: string, task: string, startedAt: string) =>
         PrismaService.client.spiderSession.create({
            data: {
               id,
               userId: owner!.id,
               linkedInAccountId: account.id,
               kind: 'TASK',
               status: 'SUCCEEDED',
               verdict: 'DONE',
               task,
               trigger: 'manual',
               requestParams: {},
               startedAt: new Date(startedAt),
            },
         })
      const older = randomUUID()
      const newer = randomUUID()

      await session(older, 'linkedin-browse', '2026-10-18T09:00:00Z')
      await session(newer, 'linkedin-browse', '2026-10-19T09:00:00Z')
      await session(randomUUID(), 'linkedin-login', '2026-10-19T10:00:00Z')

      const [listed] = await LinkedInAccountService.listForUser(owner!.id)

      expect(listed.lastVisit).toMatchObject({
         id: newer,
         verdict: 'DONE',
         trigger: 'manual',
      })
   })

   it('should delete an owned account', async () => {
      const owner = await UserService.findByEmail(email)
      const [account] = await LinkedInAccountService.listForUser(owner!.id)

      await expect(LinkedInAccountService.deleteForUser(owner!.id, account.id)).resolves.toBe(true)
      await expect(LinkedInAccountService.listForUser(owner!.id)).resolves.toEqual([])
   })
})
