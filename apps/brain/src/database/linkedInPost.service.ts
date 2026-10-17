import { type LinkedInLink } from 'core'

import { type LinkedInPostStatus, type Prisma } from 'generated/prisma/client'

import { type RecordListQuery, addLinks, orNull, pageArgs, recordWhere } from './linkedInRecord'
import { PrismaService } from './prisma.service'

// Posts have no tags, so a list is never narrowed by one.
export type LinkedInPostListQuery = Omit<RecordListQuery<LinkedInPostStatus>, 'tag'>

const postSelect = {
   id: true,
   slug: true,
   url: true,
   expandedUrl: true,
   status: true,
   archivedAt: true,
   createdAt: true,
   updatedAt: true,
} satisfies Prisma.LinkedInPostSelect

const SEARCHED_FIELDS = ['slug'] as const

const updateOwned = (userId: string, id: string, data: Prisma.LinkedInPostUpdateInput) =>
   orNull(
      PrismaService.client.linkedInPost.update({
         where: {
            id,
            userId,
         },
         data,
         select: postSelect,
      })
   )

export class LinkedInPostService {
   public static addMany(userId: string, posts: (LinkedInLink & { expandedUrl?: string | null })[]) {
      const table = PrismaService.client.linkedInPost

      return addLinks(posts, {
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
                  data: fresh.map(({ slug, url, expandedUrl }) => ({
                     userId,
                     slug,
                     url,
                     expandedUrl: expandedUrl ?? null,
                  })),
                  skipDuplicates: true,
               })
            ).count,
      })
   }

   public static async list(userId: string, query: LinkedInPostListQuery) {
      const where = recordWhere(userId, query, SEARCHED_FIELDS)

      const [items, total] = await Promise.all([
         PrismaService.client.linkedInPost.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            ...pageArgs(query),
            select: postSelect,
         }),
         PrismaService.client.linkedInPost.count({ where }),
      ])

      return {
         items,
         total,
      }
   }

   public static getForUser(userId: string, id: string) {
      return PrismaService.client.linkedInPost.findFirst({
         where: {
            id,
            userId,
         },
         select: postSelect,
      })
   }

   public static bySlug(userId: string, slug: string) {
      return PrismaService.client.linkedInPost.findUnique({
         where: {
            userId_slug: {
               userId,
               slug,
            },
         },
         select: postSelect,
      })
   }

   public static setStatus(userId: string, id: string, status: LinkedInPostStatus) {
      return updateOwned(userId, id, { status })
   }

   // The post read for it is deleted with it.
   public static async archiveForUser(userId: string, id: string) {
      const archived = await updateOwned(userId, id, { archivedAt: new Date() })

      if (archived) {
         await PrismaService.client.pageSnapshot.deleteMany({
            where: {
               userId,
               kind: 'POST',
               slug: archived.slug,
            },
         })
      }

      return archived
   }

   public static restoreForUser(userId: string, id: string) {
      return updateOwned(userId, id, { archivedAt: null })
   }

   // The posts a workflow works through next: not done, not archived, oldest first.
   public static waiting(userId: string, take: number) {
      return PrismaService.client.linkedInPost.findMany({
         where: waitingWhere(userId),
         orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
         take,
         select: {
            id: true,
            slug: true,
            url: true,
            expandedUrl: true,
         },
      })
   }

   // Keeps the expanded form of a short link found later, so it is read only once.
   public static saveExpanded(id: string, expandedUrl: string) {
      return PrismaService.client.linkedInPost.update({
         where: { id },
         data: { expandedUrl },
         select: { id: true },
      })
   }

   public static countWaiting(userId: string) {
      return PrismaService.client.linkedInPost.count({ where: waitingWhere(userId) })
   }

   public static async markProcessed(userId: string, ids: string[]) {
      const { count } = await PrismaService.client.linkedInPost.updateMany({
         where: {
            userId,
            id: { in: ids },
         },
         data: { status: 'PROCESSED' },
      })

      return count
   }
}

const waitingWhere = (userId: string) => ({
   userId,
   status: 'UNPROCESSED' as const,
   archivedAt: null,
})
