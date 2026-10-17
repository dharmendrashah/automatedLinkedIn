import { type LinkedInLink } from 'core'

import { type LinkedInProfileStatus, type Prisma } from 'generated/prisma/client'

import { type RecordListQuery, addLinks, orNull, pageArgs, recordWhere } from './linkedInRecord'
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
   public static addMany(userId: string, profiles: LinkedInLink[]) {
      const table = PrismaService.client.linkedInProfile

      return addLinks(profiles, {
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

   // The profiles a workflow reads, newest first.
   public static recent(userId: string, take: number) {
      return PrismaService.client.linkedInProfile.findMany({
         where: {
            userId,
            archivedAt: null,
         },
         orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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

   public static countActive(userId: string) {
      return PrismaService.client.linkedInProfile.count({
         where: {
            userId,
            archivedAt: null,
         },
      })
   }
}
