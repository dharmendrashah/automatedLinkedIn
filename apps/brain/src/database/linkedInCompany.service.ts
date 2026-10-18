import { type LinkedInLink } from 'core'

import { type LinkedInCompanyStatus, type Prisma } from 'generated/prisma/client'

import {
   type InputFilter,
   type LabelChange,
   type RecordListQuery,
   addLinks,
   inputOrder,
   inputWhere,
   orNull,
   pageArgs,
   recordWhere,
   relabel,
} from './linkedInRecord'
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
   // New links get the labels; links already saved get them added to theirs.
   public static async addMany(userId: string, companies: LinkedInLink[], labels: string[] = []) {
      const table = PrismaService.client.linkedInCompany

      const saved = await addLinks(companies, {
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
                     ...(labels.length > 0 ? { tags: labels } : {}),
                  })),
                  skipDuplicates: true,
               })
            ).count,
      })

      if (labels.length > 0) {
         await LinkedInCompanyService.labelMany(
            userId,
            { slug: { in: companies.map(({ slug }) => slug) } },
            {
               add: labels,
               remove: [],
            }
         )
      }

      return saved
   }

   // Rows that are not the owner's are left alone.
   public static labelMany(userId: string, which: Prisma.LinkedInCompanyWhereInput, change: LabelChange) {
      return PrismaService.client.$transaction(async tx =>
         relabel(
            await tx.linkedInCompany.findMany({
               where: {
                  ...which,
                  userId,
               },
               select: {
                  id: true,
                  tags: true,
               },
            }),
            change,
            (id, tags) =>
               tx.linkedInCompany.update({
                  where: { id },
                  data: { tags },
               })
         )
      )
   }

   // Their company page reads are deleted with them, as for one.
   public static archiveMany(userId: string, ids: string[]) {
      return PrismaService.client.$transaction(async tx => {
         const where = {
            userId,
            id: { in: ids },
            archivedAt: null,
         }
         const slugs = (
            await tx.linkedInCompany.findMany({
               where,
               select: { slug: true },
            })
         ).map(({ slug }) => slug)
         const { count } = await tx.linkedInCompany.updateMany({
            where,
            data: { archivedAt: new Date() },
         })

         await tx.pageSnapshot.deleteMany({
            where: {
               userId,
               kind: 'COMPANY',
               slug: { in: slugs },
            },
         })

         return count
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

   public static bySlug(userId: string, slug: string) {
      return PrismaService.client.linkedInCompany.findUnique({
         where: {
            userId_slug: {
               userId,
               slug,
            },
         },
         select: companySelect,
      })
   }

   public static updateForUser(userId: string, id: string, changes: LinkedInCompanyChanges) {
      return updateOwned(userId, id, changes)
   }

   // The company page read for it is deleted with it.
   public static async archiveForUser(userId: string, id: string) {
      const archived = await updateOwned(userId, id, { archivedAt: new Date() })

      if (archived) {
         await PrismaService.client.pageSnapshot.deleteMany({
            where: {
               userId,
               kind: 'COMPANY',
               slug: archived.slug,
            },
         })
      }

      return archived
   }

   public static restoreForUser(userId: string, id: string) {
      return updateOwned(userId, id, { archivedAt: null })
   }

   // The companies a workflow's input block takes.
   public static pick(userId: string, take: number, filter: InputFilter<LinkedInCompanyStatus>) {
      return PrismaService.client.linkedInCompany.findMany({
         where: inputWhere(userId, filter),
         orderBy: inputOrder(filter.order),
         take,
         select: {
            slug: true,
            url: true,
            name: true,
         },
      })
   }

   public static countPicked(userId: string, filter: InputFilter<LinkedInCompanyStatus>) {
      return PrismaService.client.linkedInCompany.count({ where: inputWhere(userId, filter) })
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
