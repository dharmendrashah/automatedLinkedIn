import { PrismaPg } from '@prisma/adapter-pg'

import { DATABASE_URL } from 'env'

import { PrismaClient } from 'generated/prisma/client'

export class PrismaService {
   private static instance?: PrismaClient

   public static get client() {
      this.instance ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) })

      return this.instance
   }

   public static async disconnect() {
      await this.instance?.$disconnect()

      this.instance = undefined
   }

   public static async isHealthy() {
      try {
         await this.client.$queryRaw`SELECT 1`

         return true
      } catch {
         return false
      }
   }
}
