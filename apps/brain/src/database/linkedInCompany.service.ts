import { type CompanySnapshotData, type LinkedInLink, companyCardOf, companyRowFrom } from 'core'

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

export type CompanySort = { by: 'createdAt' | 'name'; desc: boolean }

export type LinkedInCompanyListQuery = RecordListQuery & {
   industries?: string[]
   countries?: string[]
   sort?: CompanySort
}

const orderOf = (sort: CompanySort | undefined): Prisma.LinkedInCompanyOrderByWithRelationInput[] =>
   sort?.by === 'name'
      ? [
           {
              name: {
                 sort: sort.desc ? 'desc' : 'asc',
                 nulls: 'last',
              },
           },
           { slug: sort.desc ? 'desc' : 'asc' },
           { id: 'desc' },
        ]
      : [{ createdAt: sort && !sort.desc ? 'asc' : 'desc' }, { id: sort && !sort.desc ? 'asc' : 'desc' }]

const companySelect = {
   id: true,
   slug: true,
   url: true,
   name: true,
   industry: true,
   website: true,
   size: true,
   location: true,
   country: true,
   notes: true,
   tags: true,
   status: true,
   archivedAt: true,
   createdAt: true,
   updatedAt: true,
   // The latest visit an account of the owner made to this company that was asked for or went through (.plan/visit-company-task.md).
   visits: {
      where: { status: { in: ['ASKED', 'DONE'] } },
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: {
         createdAt: true,
         status: true,
         account: { select: { email: true } },
      },
   },
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

// The label of companies a profile read added, so the owner can tell them from the ones they saved.
export const FOUND_ON_PROFILES = 'From profiles'

export class LinkedInCompanyService {
   // Every company a profile read found: added once, an archived one left archived, a name filled only where none is set.
   public static async saveFound(userId: string, companies: Array<{ slug: string; name: string | null }>) {
      const table = PrismaService.client.linkedInCompany

      if (companies.length === 0) {
         return
      }

      await table.createMany({
         data: companies.map(({ slug, name }) => ({
            userId,
            slug,
            url: `https://www.linkedin.com/company/${encodeURIComponent(slug)}`,
            name,
            tags: [FOUND_ON_PROFILES],
         })),
         skipDuplicates: true,
      })

      for (const { slug, name } of companies) {
         if (name) {
            await table.updateMany({
               where: {
                  userId,
                  slug,
                  name: null,
               },
               data: { name },
            })
         }
      }
   }

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
      const { industries = [], countries = [] } = query
      const where: Prisma.LinkedInCompanyWhereInput = {
         ...recordWhere(userId, query, SEARCHED_FIELDS),
         ...(industries.length > 0 ? { industry: { in: industries } } : {}),
         ...(countries.length > 0 ? { country: { in: countries } } : {}),
      }

      const [items, total] = await Promise.all([
         PrismaService.client.linkedInCompany.findMany({
            where,
            orderBy: orderOf(query.sort),
            ...pageArgs(query),
            select: companySelect,
         }),
         PrismaService.client.linkedInCompany.count({ where }),
      ])
      const reads = new Map(
         (
            await PrismaService.client.pageSnapshot.findMany({
               where: {
                  userId,
                  kind: 'COMPANY',
                  slug: { in: items.map(({ slug }) => slug) },
               },
               select: {
                  slug: true,
                  data: true,
                  fetchedAt: true,
               },
            })
         ).map(read => [read.slug, read])
      )

      return {
         items: items.map(item => {
            const read = reads.get(item.slug)

            return {
               ...item,
               card: read ? companyCardOf(read.data) : null,
               readAt: read?.fetchedAt ?? null,
            }
         }),
         total,
      }
   }

   // A company read overwrites the row's name, industry, website, size, headquarters and country where it has them.
   public static applyRead(userId: string, slug: string, snapshot: CompanySnapshotData) {
      return PrismaService.client.linkedInCompany.updateMany({
         where: {
            userId,
            slug,
         },
         data: companyRowFrom(snapshot),
      })
   }

   // The industries and countries of the owner's companies, for the Companies filters.
   public static async facets(userId: string) {
      const where = {
         userId,
         archivedAt: null,
      }
      const [industries, countries] = await Promise.all([
         PrismaService.client.linkedInCompany.groupBy({
            by: ['industry'],
            where: {
               ...where,
               industry: { not: null },
            },
            _count: { _all: true },
         }),
         PrismaService.client.linkedInCompany.groupBy({
            by: ['country'],
            where: {
               ...where,
               country: { not: null },
            },
            _count: { _all: true },
         }),
      ])
      const counts = (values: Array<{ value: string | null; count: number }>) =>
         values
            .flatMap(({ value, count }) =>
               value
                  ? [
                       {
                          value,
                          count,
                       },
                    ]
                  : []
            )
            .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))

      return {
         industries: counts(
            industries.map(row => ({
               value: row.industry,
               count: row._count._all,
            }))
         ),
         countries: counts(
            countries.map(row => ({
               value: row.country,
               count: row._count._all,
            }))
         ),
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
