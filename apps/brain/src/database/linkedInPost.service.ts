import { type LinkedInLink } from 'core'

import { type LinkedInPostStatus, type Prisma } from 'generated/prisma/client'

import {
   EVERYTHING,
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

export type LinkedInPostListQuery = RecordListQuery<LinkedInPostStatus>

const ALL_WAITING: InputFilter<never> = {
   ...EVERYTHING,
   order: 'oldest',
}

const postSelect = {
   id: true,
   slug: true,
   url: true,
   expandedUrl: true,
   status: true,
   tags: true,
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
   // New links get the labels; links already saved get them added to theirs.
   public static async addMany(
      userId: string,
      posts: (LinkedInLink & { expandedUrl?: string | null })[],
      labels: string[] = []
   ) {
      const table = PrismaService.client.linkedInPost

      const saved = await addLinks(posts, {
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
                     ...(labels.length > 0 ? { tags: labels } : {}),
                  })),
                  skipDuplicates: true,
               })
            ).count,
      })

      if (labels.length > 0) {
         await LinkedInPostService.labelMany(
            userId,
            { slug: { in: posts.map(({ slug }) => slug) } },
            {
               add: labels,
               remove: [],
            }
         )
      }

      return saved
   }

   // Rows that are not the owner's are left alone.
   public static labelMany(userId: string, which: Prisma.LinkedInPostWhereInput, change: LabelChange) {
      return PrismaService.client.$transaction(async tx =>
         relabel(
            await tx.linkedInPost.findMany({
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
               tx.linkedInPost.update({
                  where: { id },
                  data: { tags },
               })
         )
      )
   }

   // Their post reads, comments and reactions are deleted with them, as for one.
   public static archiveMany(userId: string, ids: string[]) {
      return PrismaService.client.$transaction(async tx => {
         const where = {
            userId,
            id: { in: ids },
            archivedAt: null,
         }
         const slugs = (
            await tx.linkedInPost.findMany({
               where,
               select: { slug: true },
            })
         ).map(({ slug }) => slug)
         const { count } = await tx.linkedInPost.updateMany({
            where,
            data: { archivedAt: new Date() },
         })

         await tx.pageSnapshot.deleteMany({
            where: {
               userId,
               kind: { in: ['POST', 'POST_COMMENTS', 'POST_REACTIONS'] },
               slug: { in: slugs },
            },
         })

         return count
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

   public static updateForUser(userId: string, id: string, changes: { status?: LinkedInPostStatus; tags?: string[] }) {
      return updateOwned(userId, id, changes)
   }

   // The post read and its comments and reactions are deleted with it.
   public static async archiveForUser(userId: string, id: string) {
      const archived = await updateOwned(userId, id, { archivedAt: new Date() })

      if (archived) {
         await PrismaService.client.pageSnapshot.deleteMany({
            where: {
               userId,
               kind: { in: ['POST', 'POST_COMMENTS', 'POST_REACTIONS'] },
               slug: archived.slug,
            },
         })
      }

      return archived
   }

   public static restoreForUser(userId: string, id: string) {
      return updateOwned(userId, id, { archivedAt: null })
   }

   // The posts a workflow works through next: not done, not archived, oldest first unless the block says otherwise.
   public static waiting(userId: string, take: number, filter: InputFilter<never> = ALL_WAITING) {
      return PrismaService.client.linkedInPost.findMany({
         where: waitingWhere(userId, filter),
         orderBy: inputOrder(filter.order),
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

   public static countWaiting(userId: string, filter: InputFilter<never> = ALL_WAITING) {
      return PrismaService.client.linkedInPost.count({ where: waitingWhere(userId, filter) })
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

const waitingWhere = (userId: string, filter: InputFilter<never>) => ({
   ...inputWhere(userId, filter),
   status: 'UNPROCESSED' as const,
})
