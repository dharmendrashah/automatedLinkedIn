import { briefSignals, explainMatched } from 'core'

import { type Prisma, type WorkflowListMemberState, type WorkflowListMemberStatus } from 'generated/prisma/client'

import { pageArgs } from './linkedInRecord'
import { PrismaService } from './prisma.service'
import { WorkflowListService, contactedFor } from './workflowList.service'

// The leads inbox: the owner's people across all their lists, worked through by status. Every query and change is
// scoped to the owner's lists.

export const INBOX_VIEWS = ['TODO', 'CONTACTED', 'REPLIED', 'NOT_A_FIT', 'ALL'] as const

export type InboxView = (typeof INBOX_VIEWS)[number]

const VIEW_STATUS: Record<Exclude<InboxView, 'ALL'>, WorkflowListMemberStatus> = {
   TODO: 'NEW',
   CONTACTED: 'CONTACTED',
   REPLIED: 'REPLIED',
   NOT_A_FIT: 'NOT_A_FIT',
}

export type InboxQuery = {
   view: InboxView
   listId?: string
   fit?: WorkflowListMemberState
   // Only people untouched for 180 days and marked for review.
   untouched?: boolean
   search?: string
   sort: 'fit' | 'newest'
   page: number
   pageSize: number
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const SUPPRESSED_SHOWN = 200
const SEARCHED = ['name', 'headline', 'location', 'company', 'slug'] as const

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
   score: true,
   signals: true,
   addedByRunId: true,
   title: true,
   company: true,
   followers: true,
   matched: true,
   notes: true,
   tags: true,
   reviewAt: true,
   contactedAt: true,
   createdAt: true,
} satisfies Prisma.WorkflowListMemberSelect

// What a removed person was, so an undo can put them back as they were.
export type RemovedMember = Prisma.WorkflowListMemberGetPayload<{ select: typeof memberSelect }>

export type RestoredMember = Omit<RemovedMember, 'signals'> & { signals: Prisma.InputJsonValue }

const owned = (userId: string, ids: string[]) => ({
   id: { in: ids },
   list: { userId },
})

const baseWhere = (userId: string, query: Omit<InboxQuery, 'view' | 'sort' | 'page' | 'pageSize'>) =>
   ({
      list: { userId },
      ...(query.listId ? { listId: query.listId } : {}),
      ...(query.fit ? { state: query.fit } : {}),
      ...(query.untouched ? { reviewAt: { not: null } } : {}),
      ...(query.search
         ? {
              OR: SEARCHED.map(field => ({
                 [field]: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                 },
              })),
           }
         : {}),
   }) satisfies Prisma.WorkflowListMemberWhereInput

const viewWhere = (view: InboxView) => (view === 'ALL' ? {} : { status: VIEW_STATUS[view] })

export class InboxService {
   public static async inbox(userId: string, query: InboxQuery) {
      const where = baseWhere(userId, query)
      const db = PrismaService.client
      const [items, total, byStatus, all, doNotContact, newThisWeek, user] = await Promise.all([
         db.workflowListMember.findMany({
            where: {
               ...where,
               ...viewWhere(query.view),
            },
            orderBy:
               query.sort === 'fit'
                  ? [
                       {
                          score: {
                             sort: 'desc',
                             nulls: 'last',
                          },
                       },
                       { createdAt: 'desc' },
                       { id: 'desc' },
                    ]
                  : [{ createdAt: 'desc' }, { id: 'desc' }],
            ...pageArgs(query),
            select: {
               ...memberSelect,
               list: { select: { name: true } },
            },
         }),
         db.workflowListMember.count({
            where: {
               ...where,
               ...viewWhere(query.view),
            },
         }),
         db.workflowListMember.groupBy({
            by: ['status'],
            where,
            _count: { _all: true },
         }),
         db.workflowListMember.count({ where }),
         db.suppression.count({ where: { userId } }),
         db.workflowListMember.count({
            where: {
               list: { userId },
               status: 'NEW',
               createdAt: { gte: new Date(Date.now() - WEEK_MS) },
            },
         }),
         db.user.findUnique({
            where: { id: userId },
            select: { inboxSeenAt: true },
         }),
      ])
      const countOf = (status: WorkflowListMemberStatus) =>
         byStatus.find(group => group.status === status)?._count._all ?? 0

      return {
         items: items.map(item => ({
            ...item,
            signals: briefSignals(item.signals),
            reasons: explainMatched(item.matched),
         })),
         total,
         counts: {
            TODO: countOf('NEW'),
            CONTACTED: countOf('CONTACTED'),
            REPLIED: countOf('REPLIED'),
            NOT_A_FIT: countOf('NOT_A_FIT'),
            ALL: all,
         },
         doNotContact,
         newThisWeek,
         seenAt: user?.inboxSeenAt ?? null,
      }
   }

   // The number changed; ids that are not the owner's are left alone.
   public static async setStatus(userId: string, ids: string[], status: WorkflowListMemberStatus) {
      const { count } = await PrismaService.client.workflowListMember.updateMany({
         where: owned(userId, ids),
         // Any change counts as touching the person, so a review mark goes away.
         data: {
            status,
            reviewAt: null,
            ...contactedFor(status),
         },
      })

      return count
   }

   // Into one of the owner's lists; null when the list is not theirs.
   public static async move(userId: string, ids: string[], listId: string) {
      const list = await PrismaService.client.workflowList.findFirst({
         where: {
            id: listId,
            userId,
         },
         select: { id: true },
      })

      if (!list) {
         return null
      }

      const { count } = await PrismaService.client.workflowListMember.updateMany({
         where: owned(userId, ids),
         data: { listId },
      })

      return count
   }

   // Deletes the people and hands back what they were, for an undo.
   public static remove(userId: string, ids: string[]) {
      return PrismaService.client.$transaction(async tx => {
         const removed = await tx.workflowListMember.findMany({
            where: owned(userId, ids),
            select: memberSelect,
         })

         await tx.workflowListMember.deleteMany({ where: { id: { in: removed.map(({ id }) => id) } } })

         return removed
      })
   }

   // Puts removed people back into the owner's lists, unless they were marked do not contact or are in a list again.
   public static async restore(userId: string, people: RestoredMember[]) {
      const lists = await PrismaService.client.workflowList.findMany({
         where: {
            userId,
            id: { in: people.map(({ listId }) => listId) },
         },
         select: { id: true },
      })
      const ownedLists = new Set(lists.map(({ id }) => id))
      const seen = await WorkflowListService.seenAmong(
         userId,
         people.map(({ slug }) => slug),
         {
            lists: true,
            profiles: false,
         }
      )
      const back = people.filter(({ listId, slug }) => ownedLists.has(listId) && !seen.has(slug))
      const { count } = await PrismaService.client.workflowListMember.createMany({
         data: back,
         skipDuplicates: true,
      })

      return count
   }

   // Everyone the owner must never contact, newest first; workflows never add them again.
   public static suppressed(userId: string) {
      return PrismaService.client.suppression.findMany({
         where: { userId },
         orderBy: { createdAt: 'desc' },
         take: SUPPRESSED_SHOWN,
         select: {
            slug: true,
            createdAt: true,
         },
      })
   }

   public static markSeen(userId: string) {
      return PrismaService.client.user.update({
         where: { id: userId },
         data: { inboxSeenAt: new Date() },
         select: { inboxSeenAt: true },
      })
   }
}
