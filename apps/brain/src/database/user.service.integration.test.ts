import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

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
})
