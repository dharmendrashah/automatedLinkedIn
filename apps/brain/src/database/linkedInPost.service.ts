import { type LinkedInLink, postCardOf } from 'core'

import { type LinkedInPostStatus, type Prisma } from 'generated/prisma/client'

import {
   EVERYTHING,
   type Imported,
   type InputFilter,
   type LabelChange,
   addLinks,
   inputOrder,
   inputWhere,
   mergeLabels,
   orNull,
   relabel,
} from './linkedInRecord'
import { type PostListQuery, postCountSql, postPageSql, postPeopleSql, postSummarySql } from './postList'
import { PrismaService } from './prisma.service'

export type LinkedInPostListQuery = PostListQuery

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

type PeopleRow = { postId: string; slug: string; name: string | null; found: bigint; qualified: bigint }

const NO_PEOPLE = {
   found: 0,
   qualified: 0,
   first: [],
}

// Per post: how many people were found from it, how many qualified, and the first three.
const peopleOf = async (ids: string[]) => {
   const rows = ids.length > 0 ? await PrismaService.client.$queryRaw<PeopleRow[]>(postPeopleSql(ids)) : []
   const people = new Map<
      string,
      { found: number; qualified: number; first: Array<{ slug: string; name: string | null }> }
   >()

   for (const { postId, slug, name, found, qualified } of rows) {
      const known = people.get(postId)
      const person = {
         slug,
         name,
      }

      people.set(postId, {
         found: Number(found),
         qualified: Number(qualified),
         first: [...(known?.first ?? []), person],
      })
   }

   return people
}

const savedSlugs = async (userId: string, slugs: string[]) =>
   new Set(
      (
         await PrismaService.client.linkedInPost.findMany({
            where: {
               userId,
               slug: { in: slugs },
            },
            select: { slug: true },
         })
      ).map(({ slug }) => slug)
   )

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

   // Whether each post of an import is new or already here, changing nothing.
   public static async preview(userId: string, links: Imported[]) {
      const saved = await savedSlugs(
         userId,
         links.map(({ slug }) => slug)
      )

      return links.map(({ url, slug, inputs }) => ({
         url,
         slug,
         inputs,
         state: saved.has(slug) ? ('ALREADY_HERE' as const) : ('NEW' as const),
      }))
   }

   // Adds the import's posts, then gives each the shared labels and its own. Safe to repeat. `fresh` are the new ones.
   public static async importMany(
      userId: string,
      links: Array<Imported & { expandedUrl: string | null }>,
      labels: string[]
   ) {
      const slugs = links.map(({ slug }) => slug)
      const before = await savedSlugs(userId, slugs)
      const saved = await LinkedInPostService.addMany(userId, links)
      const bySlug = new Map(links.map(link => [link.slug, link]))
      const full = await PrismaService.client.$transaction(async tx => {
         const rows = await tx.linkedInPost.findMany({
            where: {
               userId,
               slug: { in: slugs },
            },
            select: {
               id: true,
               slug: true,
               tags: true,
            },
         })
         let over = 0

         for (const row of rows) {
            const merged = mergeLabels(row.tags, {
               add: [...labels, ...(bySlug.get(row.slug)?.labels ?? [])],
               remove: [],
            })

            over += merged.full ? 1 : 0

            if (merged.labels.join('\n') !== row.tags.join('\n')) {
               await tx.linkedInPost.update({
                  where: { id: row.id },
                  data: { tags: merged.labels },
               })
            }
         }

         return over
      })

      return {
         ...saved,
         full,
         slugs,
         fresh: slugs.filter(slug => !before.has(slug)),
      }
   }

   // One page of the table: each post with the few read fields a row shows and the people found from it.
   public static async list(userId: string, query: LinkedInPostListQuery) {
      const [ids, [count]] = await Promise.all([
         PrismaService.client.$queryRaw<Array<{ id: string }>>(postPageSql(userId, query)),
         PrismaService.client.$queryRaw<Array<{ total: bigint }>>(postCountSql(userId, query)),
      ])
      const order = ids.map(({ id }) => id)
      const rows = await PrismaService.client.linkedInPost.findMany({
         where: {
            userId,
            id: { in: order },
         },
         select: postSelect,
      })
      const [reads, people] = await Promise.all([
         PrismaService.client.pageSnapshot.findMany({
            where: {
               userId,
               kind: 'POST',
               slug: { in: rows.map(({ slug }) => slug) },
            },
            select: {
               slug: true,
               data: true,
               fetchedAt: true,
            },
         }),
         peopleOf(order),
      ])
      const byId = new Map(rows.map(row => [row.id, row]))
      const readOf = new Map(reads.map(read => [read.slug, read]))

      return {
         items: order.flatMap(id => {
            const row = byId.get(id)
            const read = row && readOf.get(row.slug)

            return row
               ? [
                    {
                       ...row,
                       card: read ? postCardOf(read.data) : null,
                       readAt: read?.fetchedAt ?? null,
                       people: people.get(id) ?? NO_PEOPLE,
                    },
                 ]
               : []
         }),
         total: Number(count?.total ?? 0),
      }
   }

   // The page's line and tab counts.
   public static async summary(userId: string) {
      const [row] = await PrismaService.client.$queryRaw<
         Array<{ toWork: bigint; done: bigint; unread: bigint; found: bigint; qualified: bigint }>
      >(postSummarySql(userId))

      return {
         toWork: Number(row?.toWork ?? 0),
         done: Number(row?.done ?? 0),
         unread: Number(row?.unread ?? 0),
         found: Number(row?.found ?? 0),
         qualified: Number(row?.qualified ?? 0),
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

   // Rows that are not the owner's are left alone.
   public static async setStatusMany(userId: string, ids: string[], status: LinkedInPostStatus) {
      const { count } = await PrismaService.client.linkedInPost.updateMany({
         where: {
            userId,
            id: { in: ids },
         },
         data: { status },
      })

      return count
   }
}

const waitingWhere = (userId: string, filter: InputFilter<never>) => ({
   ...inputWhere(userId, filter),
   status: 'UNPROCESSED' as const,
})
