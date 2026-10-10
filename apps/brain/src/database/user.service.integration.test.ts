import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import { PrismaService } from './prisma.service'
import { AccountConflictError, UserService } from './user.service'

const email = `${randomUUID()}@example.com`

describe('UserService (database)', () => {
   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })

      await PrismaService.disconnect()
   })

   it('should report a healthy database', async () => {
      await expect(PrismaService.isHealthy()).resolves.toBe(true)
   })

   it('should create and read a user with defaults', async () => {
      const created = await UserService.create({ email })

      expect(created).toMatchObject({
         email,
         role: 'USER',
         name: null,
      })

      await expect(UserService.findById(created.id)).resolves.toEqual(created)

      await expect(UserService.findByEmail(email)).resolves.toEqual(created)
   })

   it('should reject a duplicate email', async () => {
      await expect(UserService.create({ email })).rejects.toThrow()
   })

   it('should list users', async () => {
      const users = await UserService.list()

      expect(users.some(user => user.email === email)).toBe(true)
   })

   describe('linkAuthentikAccount', () => {
      const linkEmail = `${randomUUID()}@example.com`
      const sub = randomUUID()

      afterAll(async () => {
         await PrismaService.client.user.deleteMany({ where: { email: linkEmail } })
      })

      it('should not link by email when the email is not verified', async () => {
         await UserService.create({ email: linkEmail })

         await expect(
            UserService.linkAuthentikAccount({
               id: sub,
               email: linkEmail,
               emailVerified: false,
            })
         ).resolves.toBeNull()

         await expect(UserService.findByEmail(linkEmail)).resolves.toMatchObject({ authentikId: null })
      })

      it('should link a verified email, ignoring case, and keep it linked', async () => {
         const linked = await UserService.linkAuthentikAccount({
            id: sub,
            email: linkEmail.toUpperCase(),
            emailVerified: true,
         })

         expect(linked).toMatchObject({
            email: linkEmail,
            authentikId: sub,
         })

         await expect(UserService.findByAuthentikId(sub)).resolves.toEqual(linked)

         await expect(
            UserService.linkAuthentikAccount({
               id: sub,
               emailVerified: false,
            })
         ).resolves.toEqual(linked)
      })

      it('should never relink a user that belongs to another account', async () => {
         await expect(
            UserService.linkAuthentikAccount({
               id: randomUUID(),
               email: linkEmail,
               emailVerified: true,
            })
         ).resolves.toBeNull()

         await expect(UserService.findByEmail(linkEmail)).resolves.toMatchObject({ authentikId: sub })
      })
   })

   describe('provisionAuthentikAccount', () => {
      const newEmail = `${randomUUID()}@example.com`
      const newSub = randomUUID()

      afterAll(async () => {
         await PrismaService.client.user.deleteMany({ where: { email: newEmail } })
      })

      it('should create a user for a new account and return the same one afterwards', async () => {
         const account = {
            id: newSub,
            name: 'New Person',
            email: newEmail,
            emailVerified: false,
         }

         const created = await UserService.provisionAuthentikAccount(account)

         expect(created).toMatchObject({
            email: newEmail,
            name: 'New Person',
            role: 'USER',
            authentikId: newSub,
         })

         await expect(UserService.provisionAuthentikAccount(account)).resolves.toEqual(created)
      })

      it('should create only one user when the same account is provisioned concurrently', async () => {
         const raceEmail = `${randomUUID()}@example.com`
         const raceSub = randomUUID()

         try {
            const account = {
               id: raceSub,
               email: raceEmail,
               emailVerified: false,
            }

            const results = await Promise.allSettled([
               UserService.provisionAuthentikAccount(account),
               UserService.provisionAuthentikAccount(account),
               UserService.provisionAuthentikAccount(account),
            ])

            const users = results.flatMap(result =>
               result.status === 'fulfilled' && result.value ? [result.value] : []
            )

            expect(new Set(users.map(user => user.id)).size).toBe(1)
            expect(await PrismaService.client.user.count({ where: { email: raceEmail } })).toBe(1)
         } finally {
            await PrismaService.client.user.deleteMany({ where: { email: raceEmail } })
         }
      })

      it('should not create a user for an account without an email', async () => {
         await expect(
            UserService.provisionAuthentikAccount({
               id: randomUUID(),
               emailVerified: false,
            })
         ).resolves.toBeNull()
      })

      it('should refuse an email that belongs to another unlinked user, ignoring case', async () => {
         await expect(
            UserService.provisionAuthentikAccount({
               id: randomUUID(),
               email: email.toUpperCase(),
               emailVerified: false,
            })
         ).rejects.toBeInstanceOf(AccountConflictError)

         await expect(UserService.findByEmail(email)).resolves.toMatchObject({ authentikId: null })
      })
   })
})
