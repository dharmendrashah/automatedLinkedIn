import { createHash } from 'node:crypto'

import { PrismaService } from './prisma.service'

const KEEP_MS = 30 * 24 * 60 * 60 * 1000

const loginHash = (email: string) => createHash('sha256').update(email.trim().toLowerCase()).digest('hex')

// The logins whose account was deleted after its first day, so a re-added login gets no second night allowance (.plan/first-day-reads.md).
export class FirstDayUsedService {
   public static async remember(userId: string, email: string) {
      const key = {
         userId,
         loginHash: loginHash(email),
      }

      await PrismaService.client.firstDayUsed.upsert({
         where: { userId_loginHash: key },
         create: key,
         update: { usedAt: new Date() },
      })
   }

   public static async used(userId: string, email: string, now = new Date()) {
      const found = await PrismaService.client.firstDayUsed.findFirst({
         where: {
            userId,
            loginHash: loginHash(email),
            usedAt: { gte: new Date(now.getTime() - KEEP_MS) },
         },
         select: { userId: true },
      })

      return found !== null
   }

   public static async sweep(now = new Date()) {
      const cutoff = new Date(now.getTime() - KEEP_MS)
      const { count } = await PrismaService.client.firstDayUsed.deleteMany({ where: { usedAt: { lt: cutoff } } })

      return count
   }
}
