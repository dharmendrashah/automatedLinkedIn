import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UserService } from './user.service'

const user = {
   create: vi.fn(),
   findUnique: vi.fn(),
   findMany: vi.fn(),
}

vi.mock('./prisma.service', () => ({
   PrismaService: {
      get client() {
         return { user }
      },
   },
}))

describe('UserService', () => {
   beforeEach(() => {
      vi.clearAllMocks()
   })

   it('should create a user', async () => {
      const data = { email: 'a@example.com' }

      user.create.mockResolvedValueOnce({
         id: '1',
         ...data,
      })

      await expect(UserService.create(data)).resolves.toEqual({
         id: '1',
         ...data,
      })

      expect(user.create).toHaveBeenCalledWith({ data })
   })

   it('should find a user by id', async () => {
      await UserService.findById('1')

      expect(user.findUnique).toHaveBeenCalledWith({ where: { id: '1' } })
   })

   it('should find a user by email', async () => {
      await UserService.findByEmail('a@example.com')

      expect(user.findUnique).toHaveBeenCalledWith({ where: { email: 'a@example.com' } })
   })

   it('should list users oldest first', async () => {
      await UserService.list()

      expect(user.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'asc' } })
   })
})
