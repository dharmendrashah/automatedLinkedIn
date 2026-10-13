import { type ProfileUrl } from 'core'

import { type LinkedInProfileStatus, type Prisma } from 'generated/prisma/client'

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

export type LinkedInProfileListQuery = {
   search?: string
   status?: LinkedInProfileStatus
   tag?: string
   includeArchived?: boolean
   page: number
   pageSize: number
}

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

const isNotFound = (error: unknown) => (error as { code?: string } | null)?.code === 'P2025'

const buildWhere = (userId: string, query: LinkedInProfileListQuery): Prisma.LinkedInProfileWhereInput => ({
   userId,
   ...(query.includeArchived ? {} : { archivedAt: null }),
   ...(query.status ? { status: query.status } : {}),
   ...(query.tag ? { tags: { has: query.tag } } : {}),
   ...(query.search
      ? {
           OR: SEARCHED_FIELDS.map(field => ({
              [field]: {
                 contains: query.search,
                 mode: 'insensitive',
              },
           })),
        }
      : {}),
})

// The id alone is not enough: every write names the owner, so a foreign id is the same as a missing one.
const updateOwned = async (userId: string, id: string, data: Prisma.LinkedInProfileUpdateInput) => {
   try {
      return await PrismaService.client.linkedInProfile.update({
         where: {
            id,
            userId,
         },
         data,
         select: profileSelect,
      })
   } catch (error) {
      if (isNotFound(error)) {
         return null
      }

      throw error
   }
}

export class LinkedInProfileService {
   // Saves each new profile, restores archived ones and leaves live ones alone. Safe to repeat or to race.
   public static async addMany(userId: string, profiles: ProfileUrl[]) {
      if (profiles.length === 0) {
         return {
            created: 0,
            restored: 0,
            skipped: 0,
         }
      }

      const existing = await PrismaService.client.linkedInProfile.findMany({
         where: {
            userId,
            slug: { in: profiles.map(({ slug }) => slug) },
         },
         select: {
            slug: true,
            archivedAt: true,
         },
      })

      const known = new Set(existing.map(({ slug }) => slug))
      const archived = existing.filter(({ archivedAt }) => archivedAt).map(({ slug }) => slug)

      const restored =
         archived.length > 0
            ? await PrismaService.client.linkedInProfile.updateMany({
                 where: {
                    userId,
                    slug: { in: archived },
                 },
                 data: { archivedAt: null },
              })
            : { count: 0 }

      const fresh = profiles.filter(({ slug }) => !known.has(slug))
      const created =
         fresh.length > 0
            ? await PrismaService.client.linkedInProfile.createMany({
                 data: fresh.map(({ slug, url }) => ({
                    userId,
                    slug,
                    url,
                 })),
                 skipDuplicates: true,
              })
            : { count: 0 }

      return {
         created: created.count,
         restored: restored.count,
         skipped: profiles.length - created.count - restored.count,
      }
   }

   public static async list(userId: string, query: LinkedInProfileListQuery) {
      const where = buildWhere(userId, query)

      const [items, total] = await Promise.all([
         PrismaService.client.linkedInProfile.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip: (query.page - 1) * query.pageSize,
            take: query.pageSize,
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

   public static updateForUser(userId: string, id: string, changes: LinkedInProfileChanges) {
      return updateOwned(userId, id, changes)
   }

   public static archiveForUser(userId: string, id: string) {
      return updateOwned(userId, id, { archivedAt: new Date() })
   }

   public static restoreForUser(userId: string, id: string) {
      return updateOwned(userId, id, { archivedAt: null })
   }
}
