import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AccountConflictError, UserService } from './user.service'

const user = {
   create: vi.fn(),
   findUnique: vi.fn(),
   findFirst: vi.fn(),
   findMany: vi.fn(),
   updateMany: vi.fn(),
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

   it('should find a user by authentik id', async () => {
      await UserService.findByAuthentikId('sub-1')

      expect(user.findUnique).toHaveBeenCalledWith({ where: { authentikId: 'sub-1' } })
   })

   describe('linkAuthentikAccount', () => {
      const linked = {
         id: '1',
         authentikId: 'sub-1',
      }

      it('should return the user already linked to the account', async () => {
         user.findUnique.mockResolvedValueOnce(linked)

         await expect(
            UserService.linkAuthentikAccount({
               id: 'sub-1',
               email: 'a@example.com',
               emailVerified: true,
            })
         ).resolves.toBe(linked)

         expect(user.updateMany).not.toHaveBeenCalled()
      })

      it.each([
         [
            'has no email',
            {
               id: 'sub-1',
               emailVerified: true,
            },
         ],
         [
            'has an unverified email',
            {
               id: 'sub-1',
               email: 'a@example.com',
               emailVerified: false,
            },
         ],
      ])('should not link by email when the account %s', async (_, identity) => {
         user.findUnique.mockResolvedValueOnce(null)

         await expect(UserService.linkAuthentikAccount(identity)).resolves.toBeNull()

         expect(user.updateMany).not.toHaveBeenCalled()
      })

      it('should link an unlinked user with the same verified email, ignoring case', async () => {
         user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(linked)

         await expect(
            UserService.linkAuthentikAccount({
               id: 'sub-1',
               email: 'A@Example.com',
               emailVerified: true,
            })
         ).resolves.toBe(linked)

         expect(user.updateMany).toHaveBeenCalledWith({
            where: {
               email: {
                  equals: 'A@Example.com',
                  mode: 'insensitive',
               },
               authentikId: null,
            },
            data: { authentikId: 'sub-1' },
         })
      })

      it('should return null when no unlinked user has that email', async () => {
         user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
         user.updateMany.mockResolvedValueOnce({ count: 0 })

         await expect(
            UserService.linkAuthentikAccount({
               id: 'sub-1',
               email: 'a@example.com',
               emailVerified: true,
            })
         ).resolves.toBeNull()
      })
   })

   describe('provisionAuthentikAccount', () => {
      const account = {
         id: 'sub-1',
         name: 'Ada',
         email: 'ada@example.com',
         emailVerified: false,
      }

      const created = {
         id: '1',
         authentikId: 'sub-1',
      }

      it('should return the user already linked to the account without creating one', async () => {
         user.findUnique.mockResolvedValueOnce(created)

         await expect(UserService.provisionAuthentikAccount(account)).resolves.toBe(created)

         expect(user.create).not.toHaveBeenCalled()
      })

      it('should create a user for an account that has none', async () => {
         user.findUnique.mockResolvedValueOnce(null)
         user.findFirst.mockResolvedValueOnce(null)
         user.create.mockResolvedValueOnce(created)

         await expect(UserService.provisionAuthentikAccount(account)).resolves.toBe(created)

         expect(user.findFirst).toHaveBeenCalledWith({
            where: {
               email: {
                  equals: 'ada@example.com',
                  mode: 'insensitive',
               },
            },
            select: { id: true },
         })
         expect(user.create).toHaveBeenCalledWith({
            data: {
               email: 'ada@example.com',
               name: 'Ada',
               authentikId: 'sub-1',
            },
         })
      })

      it('should not create a user when the account has no email', async () => {
         user.findUnique.mockResolvedValueOnce(null)

         await expect(
            UserService.provisionAuthentikAccount({
               id: 'sub-1',
               emailVerified: false,
            })
         ).resolves.toBeNull()

         expect(user.create).not.toHaveBeenCalled()
      })

      it('should refuse to create a duplicate of an email an unlinked user already has', async () => {
         user.findUnique.mockResolvedValueOnce(null)
         user.findFirst.mockResolvedValueOnce({ id: 'other' })

         await expect(UserService.provisionAuthentikAccount(account)).rejects.toBeInstanceOf(AccountConflictError)

         expect(user.create).not.toHaveBeenCalled()
      })

      it('should return the row a concurrent request created for the same account', async () => {
         user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(created)
         user.findFirst.mockResolvedValueOnce(null)
         user.create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }))

         await expect(UserService.provisionAuthentikAccount(account)).resolves.toBe(created)
      })

      it('should report a conflict when the email was taken by someone else in the meantime', async () => {
         user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
         user.findFirst.mockResolvedValueOnce(null)
         user.create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }))

         await expect(UserService.provisionAuthentikAccount(account)).rejects.toBeInstanceOf(AccountConflictError)
      })

      it('should rethrow unexpected database errors', async () => {
         const failure = new Error('connection lost')

         user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
         user.findFirst.mockResolvedValueOnce(null)
         user.create.mockRejectedValueOnce(failure)

         await expect(UserService.provisionAuthentikAccount(account)).rejects.toBe(failure)
      })
   })
})
