import { type LinkedInLink } from 'core'

import { type LinkedInProfileStatus, type Prisma } from 'generated/prisma/client'

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
export type LinkedInProfileChanges = {
   fullName?: string | null
   headline?: string | null
   company?: string | null
   location?: string | null
   notes?: string | null
   tags?: string[]
   status?: LinkedInProfileStatus
}

export type LinkedInProfileListQuery = RecordListQuery

const profileSelect = {
   id: true,
   slug: true,
   url: true,
   fullName: true,
   headline: true,
   company: true,
   location: true,
   notes: true,
   tags: true,
   status: true,
   archivedAt: true,
   createdAt: true,
   updatedAt: true,
} satisfies Prisma.LinkedInProfileSelect

const SEARCHED_FIELDS = ['fullName', 'headline', 'company', 'slug'] as const

const updateOwned = (userId: string, id: string, data: Prisma.LinkedInProfileUpdateInput) =>
   orNull(
      PrismaService.client.linkedInProfile.update({
         where: {
            id,
            userId,
         },
         data,
         select: profileSelect,
      })
   )

export class LinkedInProfileService {
   // New links get the labels; links already saved get them added to theirs.
   public static async addMany(userId: string, profiles: LinkedInLink[], labels: string[] = []) {
      const table = PrismaService.client.linkedInProfile

      const saved = await addLinks(profiles, {
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
         await LinkedInProfileService.labelMany(
            userId,
            { slug: { in: profiles.map(({ slug }) => slug) } },
            {
               add: labels,
               remove: [],
            }
         )
      }

      return saved
   }

   // Rows that are not the owner's are left alone.
   public static labelMany(userId: string, which: Prisma.LinkedInProfileWhereInput, change: LabelChange) {
      return PrismaService.client.$transaction(async tx =>
         relabel(
            await tx.linkedInProfile.findMany({
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
               tx.linkedInProfile.update({
                  where: { id },
                  data: { tags },
               })
         )
      )
   }

   public static async archiveMany(userId: string, ids: string[]) {
      const { count } = await PrismaService.client.linkedInProfile.updateMany({
         where: {
            userId,
            id: { in: ids },
            archivedAt: null,
         },
         data: { archivedAt: new Date() },
      })

      return count
   }

   public static async list(userId: string, query: LinkedInProfileListQuery) {
      const where = recordWhere(userId, query, SEARCHED_FIELDS)

      const [items, total] = await Promise.all([
         PrismaService.client.linkedInProfile.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            ...pageArgs(query),
            select: profileSelect,
         }),
         PrismaService.client.linkedInProfile.count({ where }),
      ])

      return {
         items,
         total,
      }
   }

   public static getForUser(userId: string, id: string) {
      return PrismaService.client.linkedInProfile.findFirst({
         where: {
            id,
            userId,
         },
         select: profileSelect,
      })
   }

   public static bySlug(userId: string, slug: string) {
      return PrismaService.client.linkedInProfile.findUnique({
         where: {
            userId_slug: {
               userId,
               slug,
            },
         },
         select: profileSelect,
      })
   }

   public static updateForUser(userId: string, id: string, changes: LinkedInProfileChanges) {
      return updateOwned(userId, id, changes)
   }

   public static archiveForUser(userId: string, id: string) {
      return updateOwned(userId, id, { archivedAt: new Date() })
   }

   public static restoreForUser(userId: string, id: string) {
      return updateOwned(userId, id, { archivedAt: null })
   }

   // The profiles a workflow's input block takes.
   public static pick(userId: string, take: number, filter: InputFilter<LinkedInProfileStatus>) {
      return PrismaService.client.linkedInProfile.findMany({
         where: inputWhere(userId, filter),
         orderBy: inputOrder(filter.order),
         take,
         select: {
            slug: true,
            url: true,
            fullName: true,
            headline: true,
            location: true,
         },
      })
   }

   public static countPicked(userId: string, filter: InputFilter<LinkedInProfileStatus>) {
      return PrismaService.client.linkedInProfile.count({ where: inputWhere(userId, filter) })
   }

   public static countActive(userId: string) {
      return PrismaService.client.linkedInProfile.count({
         where: {
            userId,
            archivedAt: null,
         },
      })
   }
}
