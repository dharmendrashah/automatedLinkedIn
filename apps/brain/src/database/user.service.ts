import { type Prisma } from 'generated/prisma/client'

import { PrismaService } from './prisma.service'

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

   public static list() {
      return PrismaService.client.user.findMany({ orderBy: { createdAt: 'asc' } })
   }
}
