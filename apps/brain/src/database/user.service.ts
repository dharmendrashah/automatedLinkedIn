import { type Prisma } from 'generated/prisma/client'

import { PrismaService } from './prisma.service'

type AuthentikAccount = {
   id: string
   email?: string
   name?: string
   emailVerified: boolean
}

export class AccountConflictError extends Error {
   public constructor() {
      super('An account with this email already exists and is not linked to this login')
   }
}

const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === 'P2002'

export class UserService {
   public static create(data: Prisma.UserCreateInput) {
      return PrismaService.client.user.create({ data })
   }

   public static findById(id: string) {
      return PrismaService.client.user.findUnique({ where: { id } })
   }

   public static findByEmail(email: string) {
      return PrismaService.client.user.findUnique({ where: { email } })
   }

   public static findByAuthentikId(authentikId: string) {
      return PrismaService.client.user.findUnique({ where: { authentikId } })
   }

   // Links only, never creates. Links by email only when authentik vouches for it, and only to a row not linked yet.
   public static async linkAuthentikAccount({ id, email, emailVerified }: AuthentikAccount) {
      const linked = await UserService.findByAuthentikId(id)

      if (linked || !email || !emailVerified) {
         return linked
      }

      await PrismaService.client.user.updateMany({
         where: {
            email: {
               equals: email,
               mode: 'insensitive',
            },
            authentikId: null,
         },
         data: { authentikId: id },
      })

      // Re-read instead of trusting the update count: a concurrent request may have linked it first.
      return UserService.findByAuthentikId(id)
   }

   // Links or creates the local user for an authentik account. Never links by an unverified email.
   public static async provisionAuthentikAccount(account: AuthentikAccount) {
      const linked = await UserService.linkAuthentikAccount(account)

      if (linked || !account.email) {
         return linked
      }

      const taken = await PrismaService.client.user.findFirst({
         where: {
            email: {
               equals: account.email,
               mode: 'insensitive',
            },
         },
         select: { id: true },
      })

      if (taken) {
         throw new AccountConflictError()
      }

      try {
         return await UserService.create({
            email: account.email,
            name: account.name,
            authentikId: account.id,
         })
      } catch (error) {
         if (!isUniqueViolation(error)) {
            throw error
         }

         // A concurrent request may have created this account's row first.
         const winner = await UserService.findByAuthentikId(account.id)

         if (winner) {
            return winner
         }

         throw new AccountConflictError()
      }
   }

   public static list() {
      return PrismaService.client.user.findMany({ orderBy: { createdAt: 'asc' } })
   }

   public static isAdminEmail(email: string, adminEmail: string) {
      return adminEmail !== '' && email.toLowerCase() === adminEmail.toLowerCase()
   }

   // Makes the user with this email the one platform owner and returns every other admin to USER, in one transaction (the
   // unique index "User_single_admin" allows only one). Only a user linked to a login counts: authentik vouched for the email then.
   // An empty address changes nothing.
   public static async syncAdmin(adminEmail: string) {
      if (adminEmail === '') {
         return
      }

      const db = PrismaService.client
      const sameEmail = {
         equals: adminEmail,
         mode: 'insensitive',
      } as const

      await db.$transaction([
         db.user.updateMany({
            where: {
               role: 'ADMIN',
               NOT: { email: sameEmail },
            },
            data: { role: 'USER' },
         }),
         db.user.updateMany({
            where: {
               email: sameEmail,
               authentikId: { not: null },
               role: 'USER',
            },
            data: { role: 'ADMIN' },
         }),
      ])
   }
}
