import { type Prisma } from 'generated/prisma/client'

import { uniqueOr } from './conflict'
import { orNull } from './linkedInRecord'
import { PrismaService } from './prisma.service'

export type IcpInput = {
   name: string
   includeTitles: string[]
   excludeTitles: string[]
   seniorities: string[]
   industries: string[]
   companySizes: string[]
   locations: string[]
   problemKeywords: string[]
}

const icpSelect = {
   id: true,
   name: true,
   includeTitles: true,
   excludeTitles: true,
   seniorities: true,
   industries: true,
   companySizes: true,
   locations: true,
   problemKeywords: true,
   createdAt: true,
   updatedAt: true,
} satisfies Prisma.IcpSelect

const nameTaken = (name: string) => `You already have an ideal customer named "${name}".`

export class IcpService {
   public static list(userId: string) {
      return PrismaService.client.icp.findMany({
         where: { userId },
         orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
         select: icpSelect,
      })
   }

   public static getForUser(userId: string, id: string) {
      return PrismaService.client.icp.findFirst({
         where: {
            id,
            userId,
         },
         select: icpSelect,
      })
   }

   public static create(userId: string, input: IcpInput) {
      return uniqueOr(
         PrismaService.client.icp.create({
            data: {
               userId,
               ...input,
            },
            select: icpSelect,
         }),
         nameTaken(input.name)
      )
   }

   public static update(userId: string, id: string, input: IcpInput) {
      return uniqueOr(
         orNull(
            PrismaService.client.icp.update({
               where: {
                  id,
                  userId,
               },
               data: input,
               select: icpSelect,
            })
         ),
         nameTaken(input.name)
      )
   }

   public static async delete(userId: string, id: string) {
      const { count } = await PrismaService.client.icp.deleteMany({
         where: {
            id,
            userId,
         },
      })

      return count > 0
   }
}
