import { type Prisma, type WorkflowListMemberState, type WorkflowListMemberStatus } from 'generated/prisma/client'

import { ConflictError, uniqueOr } from './conflict'
import { orNull, pageArgs } from './linkedInRecord'
import { PrismaService } from './prisma.service'

export const EXPORT_LIMIT = 10_000

export type MemberInput = {
   slug: string
   url: string
   name: string | null
   headline: string | null
   location: string | null
   state: WorkflowListMemberState
}

// null clears a field; undefined leaves it unchanged.
export type MemberChanges = {
   name?: string | null
   headline?: string | null
   location?: string | null
   state?: WorkflowListMemberState
   status?: WorkflowListMemberStatus
}

export type MemberListQuery = {
   listId: string
   state: WorkflowListMemberState
   status?: WorkflowListMemberStatus
   search?: string
   page: number
   pageSize: number
}

const listSelect = {
   id: true,
   name: true,
   createdAt: true,
   _count: { select: { members: true } },
} satisfies Prisma.WorkflowListSelect

const memberSelect = {
   id: true,
   listId: true,
   slug: true,
   url: true,
   name: true,
   headline: true,
   location: true,
   state: true,
   status: true,
   postUrl: true,
   createdAt: true,
   updatedAt: true,
} satisfies Prisma.WorkflowListMemberSelect

const SEARCHED_FIELDS = ['name', 'headline', 'location', 'slug'] as const

const nameTaken = (name: string) => `You already have a list named "${name}".`

const ownedMember = (userId: string, id: string) => ({
   id,
   list: { userId },
})

const ownsList = async (userId: string, id: string) =>
   Boolean(
      await PrismaService.client.workflowList.findFirst({
         where: {
            id,
            userId,
         },
         select: { id: true },
      })
   )

// Where the owner already has this person, so nobody is added twice; null when they are new.
const seenAt = async (userId: string, slug: string) => {
   const db = PrismaService.client
   const [suppressed, member, profile] = await Promise.all([
      db.suppression.findUnique({
         where: {
            userId_slug: {
               userId,
               slug,
            },
         },
         select: { id: true },
      }),
      db.workflowListMember.findFirst({
         where: {
            slug,
            list: { userId },
         },
         select: { list: { select: { name: true } } },
      }),
      db.linkedInProfile.findUnique({
         where: {
            userId_slug: {
               userId,
               slug,
            },
         },
         select: { id: true },
      }),
   ])

   if (suppressed) {
      return 'This person is on your do-not-contact list.'
   }

   if (member) {
      return `This person is already in the list "${member.list.name}".`
   }

   return profile ? 'This person is already in your LinkedIn profiles.' : null
}

export class WorkflowListService {
   public static lists(userId: string) {
      return PrismaService.client.workflowList.findMany({
         where: { userId },
         orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
         select: listSelect,
      })
   }

   public static createList(userId: string, name: string) {
      return uniqueOr(
         PrismaService.client.workflowList.create({
            data: {
               userId,
               name,
            },
            select: listSelect,
         }),
         nameTaken(name)
      )
   }

   public static renameList(userId: string, id: string, name: string) {
      return uniqueOr(
         orNull(
            PrismaService.client.workflowList.update({
               where: {
                  id,
                  userId,
               },
               data: { name },
               select: listSelect,
            })
         ),
         nameTaken(name)
      )
   }

   // Hard delete; the members go with the list.
   public static async deleteList(userId: string, id: string) {
      const { count } = await PrismaService.client.workflowList.deleteMany({
         where: {
            id,
            userId,
         },
      })

      return count > 0
   }

   public static async members(userId: string, query: MemberListQuery) {
      const where: Prisma.WorkflowListMemberWhereInput = {
         listId: query.listId,
         list: { userId },
         state: query.state,
         ...(query.status ? { status: query.status } : {}),
         ...(query.search
            ? {
                 OR: SEARCHED_FIELDS.map(field => ({
                    [field]: {
                       contains: query.search,
                       mode: 'insensitive' as const,
                    },
                 })),
              }
            : {}),
      }

      const [items, total] = await Promise.all([
         PrismaService.client.workflowListMember.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            ...pageArgs(query),
            select: memberSelect,
         }),
         PrismaService.client.workflowListMember.count({ where }),
      ])

      return {
         items,
         total,
      }
   }

   // null when the list is not the owner's; a ConflictError when the person was already seen.
   public static async addMember(userId: string, listId: string, input: MemberInput) {
      if (!(await ownsList(userId, listId))) {
         return null
      }

      const seen = await seenAt(userId, input.slug)

      if (seen) {
         throw new ConflictError(seen)
      }

      return uniqueOr(
         PrismaService.client.workflowListMember.create({
            data: {
               listId,
               ...input,
            },
            select: memberSelect,
         }),
         'This person is already in this list.'
      )
   }

   public static updateMember(userId: string, id: string, changes: MemberChanges) {
      return orNull(
         PrismaService.client.workflowListMember.update({
            where: ownedMember(userId, id),
            data: changes,
            select: memberSelect,
         })
      )
   }

   // One write, so the person is never in both lists or in neither.
   public static async moveMember(userId: string, id: string, listId: string) {
      if (!(await ownsList(userId, listId))) {
         return null
      }

      return uniqueOr(
         orNull(
            PrismaService.client.workflowListMember.update({
               where: ownedMember(userId, id),
               data: { listId },
               select: memberSelect,
            })
         ),
         'This person is already in that list.'
      )
   }

   public static async deleteMember(userId: string, id: string) {
      const { count } = await PrismaService.client.workflowListMember.deleteMany({ where: ownedMember(userId, id) })

      return count > 0
   }

   // Suppresses the person and removes them from every list of the owner; the number removed, or null if not found.
   public static doNotContact(userId: string, id: string) {
      return PrismaService.client.$transaction(async tx => {
         const member = await tx.workflowListMember.findFirst({
            where: ownedMember(userId, id),
            select: { slug: true },
         })

         if (!member) {
            return null
         }

         await tx.suppression.upsert({
            where: {
               userId_slug: {
                  userId,
                  slug: member.slug,
               },
            },
            create: {
               userId,
               slug: member.slug,
            },
            update: {},
         })

         const { count } = await tx.workflowListMember.deleteMany({
            where: {
               slug: member.slug,
               list: { userId },
            },
         })

         return count
      })
   }

   // The list name and its members, oldest first; null when the list is not the owner's.
   public static exportList(userId: string, id: string) {
      return PrismaService.client.workflowList.findFirst({
         where: {
            id,
            userId,
         },
         select: {
            name: true,
            members: {
               orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
               take: EXPORT_LIMIT,
               select: memberSelect,
            },
         },
      })
   }
}
