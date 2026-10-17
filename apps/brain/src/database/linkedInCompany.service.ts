import { type LinkedInLink } from 'core'

import { type LinkedInCompanyStatus, type Prisma } from 'generated/prisma/client'

import { type RecordListQuery, addLinks, orNull, pageArgs, recordWhere } from './linkedInRecord'
import { PrismaService } from './prisma.service'

// null clears a field; undefined leaves it unchanged.
export type LinkedInCompanyChanges = {
   name?: string | null
   industry?: string | null
   website?: string | null
   size?: string | null
   location?: string | null
   notes?: string | null
   tags?: string[]
   status?: LinkedInCompanyStatus
}

export type LinkedInCompanyListQuery = RecordListQuery

const companySelect = {
   id: true,
   slug: true,
   url: true,
   name: true,
   industry: true,
   website: true,
   size: true,
   location: true,
   notes: true,
   tags: true,
   status: true,
   archivedAt: true,
   createdAt: true,
   updatedAt: true,
} satisfies Prisma.LinkedInCompanySelect

const SEARCHED_FIELDS = ['name', 'industry', 'website', 'slug'] as const

const updateOwned = (userId: string, id: string, data: Prisma.LinkedInCompanyUpdateInput) =>
   orNull(
      PrismaService.client.linkedInCompany.update({
         where: {
            id,
            userId,
         },
         data,
         select: companySelect,
      })
   )

export class LinkedInCompanyService {
   public static addMany(userId: string, companies: LinkedInLink[]) {
      const table = PrismaService.client.linkedInCompany

      return addLinks(companies, {
         existing: slugs =>
            table.findMany({
               where: {
                  userId,
                  slug: { in: slugs },
               },
               select: {
                  slug: true,
                  archivedAt: true,
               },
            }),
         restore: async slugs =>
            (
               await table.updateMany({
                  where: {
                     userId,
                     slug: { in: slugs },
                  },
                  data: { archivedAt: null },
               })
            ).count,
         create: async fresh =>
            (
               await table.createMany({
                  data: fresh.map(({ slug, url }) => ({
                     userId,
                     slug,
                     url,
                  })),
                  skipDuplicates: true,
               })
            ).count,
      })
   }

   public static async list(userId: string, query: LinkedInCompanyListQuery) {
      const where = recordWhere(userId, query, SEARCHED_FIELDS)

      const [items, total] = await Promise.all([
         PrismaService.client.linkedInCompany.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            ...pageArgs(query),
            select: companySelect,
         }),
         PrismaService.client.linkedInCompany.count({ where }),
      ])

      return {
         items,
         total,
      }
   }

   public static getForUser(userId: string, id: string) {
      return PrismaService.client.linkedInCompany.findFirst({
         where: {
            id,
            userId,
         },
         select: companySelect,
      })
   }

   public static updateForUser(userId: string, id: string, changes: LinkedInCompanyChanges) {
      return updateOwned(userId, id, changes)
   }

   public static archiveForUser(userId: string, id: string) {
      return updateOwned(userId, id, { archivedAt: new Date() })
   }

   public static restoreForUser(userId: string, id: string) {
      return updateOwned(userId, id, { archivedAt: null })
   }

   // The companies a workflow reads, newest first.
   public static recent(userId: string, take: number) {
      return PrismaService.client.linkedInCompany.findMany({
         where: {
            userId,
            archivedAt: null,
         },
         orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
         take,
         select: {
            slug: true,
            url: true,
            name: true,
         },
      })
   }

   public static countActive(userId: string) {
      return PrismaService.client.linkedInCompany.count({
         where: {
            userId,
            archivedAt: null,
         },
      })
   }
}
