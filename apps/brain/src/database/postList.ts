import { type LinkedInPostStatus, Prisma } from 'generated/prisma/client'

import { likeOf } from './companyFilters'
import { type LabelMatch } from './linkedInRecord'

// The Posts table's query (.plan/posts-page-redesign.md) in SQL, because search, the read filter and the sorts look into
// the post's read (`PageSnapshot`) and the people found from it. Every value is a parameter; JSON keys are constants.

export const POST_SORTS = ['createdAt', 'postedAt', 'comments', 'qualified'] as const
export type PostSort = { by: (typeof POST_SORTS)[number]; desc: boolean }

export type PostListQuery = {
   search?: string
   status?: LinkedInPostStatus
   tags?: string[]
   tagMatch?: LabelMatch
   addedSince?: Date
   read?: 'READ' | 'UNREAD'
   sort?: PostSort
   page: number
   pageSize: number
}

// A list member found from post `p`: by the post that surfaced them, or a signal seen on it (as the post drawer matches them).
const memberOfPost = Prisma.sql`(m."postUrl" IN (p."url", p."expandedUrl")
   OR m."signals" @> jsonb_build_array(jsonb_build_object('via', p."url"))
   OR (p."expandedUrl" IS NOT NULL AND m."signals" @> jsonb_build_array(jsonb_build_object('via', p."expandedUrl"))))`

const members = Prisma.sql`"WorkflowListMember" m JOIN "WorkflowList" l ON l."id" = m."listId"`

const withRead = Prisma.sql`"LinkedInPost" p
   LEFT JOIN "PageSnapshot" s ON s."userId" = p."userId" AND s."kind" = 'POST' AND s."slug" = p."slug"`

const whereOf = (userId: string, query: Omit<PostListQuery, 'page' | 'pageSize' | 'sort'>) => {
   const { search, status, tags = [], tagMatch, addedSince, read } = query
   const like = search ? likeOf(search) : null

   return Prisma.join(
      [
         Prisma.sql`p."userId" = ${userId}`,
         Prisma.sql`p."archivedAt" IS NULL`,
         ...(status ? [Prisma.sql`p."status" = ${status}::"LinkedInPostStatus"`] : []),
         ...(tags.length > 0
            ? [tagMatch === 'all' ? Prisma.sql`p."tags" @> ${tags}::text[]` : Prisma.sql`p."tags" && ${tags}::text[]`]
            : []),
         ...(addedSince ? [Prisma.sql`p."createdAt" >= ${addedSince}`] : []),
         ...(read ? [read === 'READ' ? Prisma.sql`s."id" IS NOT NULL` : Prisma.sql`s."id" IS NULL`] : []),
         ...(like
            ? [
                 Prisma.sql`(p."slug" ILIKE ${like} OR p."url" ILIKE ${like} OR p."expandedUrl" ILIKE ${like}
                    OR s."data"->'author'->>'name' ILIKE ${like} OR s."data"->>'text' ILIKE ${like})`,
              ]
            : []),
      ],
      ' AND '
   )
}

const orderOf = (sort: PostSort | undefined) => {
   const direction = Prisma.raw(sort?.desc === false ? 'ASC' : 'DESC')
   const newest = Prisma.sql`p."createdAt" DESC, p."id" DESC`

   switch (sort?.by) {
      case 'postedAt':
         return Prisma.sql`s."data"->>'postedAt' ${direction} NULLS LAST, ${newest}`
      case 'comments':
         return Prisma.sql`(s."data"->>'comments')::numeric ${direction} NULLS LAST, ${newest}`
      case 'qualified':
         return Prisma.sql`(SELECT COUNT(*) FROM ${members} WHERE l."userId" = p."userId" AND m."state" = 'QUALIFIED' AND ${memberOfPost}) ${direction}, ${newest}`
      default:
         return Prisma.sql`p."createdAt" ${direction}, p."id" ${direction}`
   }
}

// One page of the owner's matching post ids, in order.
export const postPageSql = (userId: string, query: PostListQuery) => Prisma.sql`
   SELECT p."id" FROM ${withRead}
   WHERE ${whereOf(userId, query)}
   ORDER BY ${orderOf(query.sort)}
   LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`

export const postCountSql = (userId: string, query: PostListQuery) => Prisma.sql`
   SELECT COUNT(*) AS "total" FROM ${withRead} WHERE ${whereOf(userId, query)}`

// How many people were found from each of these posts, how many qualified, and the first three (qualified first).
export const postPeopleSql = (ids: string[]) => Prisma.sql`
   WITH found AS (
      SELECT DISTINCT p."id" AS "postId", m."id", m."slug", m."name", m."state", m."score", m."createdAt"
      FROM "LinkedInPost" p
      JOIN "WorkflowList" l ON l."userId" = p."userId"
      JOIN "WorkflowListMember" m ON m."listId" = l."id" AND ${memberOfPost}
      WHERE p."id" = ANY(${ids})
   ), ranked AS (
      SELECT *,
         ROW_NUMBER() OVER (PARTITION BY "postId" ORDER BY ("state" = 'QUALIFIED') DESC, "score" DESC NULLS LAST, "createdAt" DESC) AS "rank",
         COUNT(*) OVER (PARTITION BY "postId") AS "found",
         COUNT(*) FILTER (WHERE "state" = 'QUALIFIED') OVER (PARTITION BY "postId") AS "qualified"
      FROM found
   )
   SELECT "postId", "slug", "name", "found", "qualified" FROM ranked WHERE "rank" <= 3 ORDER BY "postId", "rank"`
