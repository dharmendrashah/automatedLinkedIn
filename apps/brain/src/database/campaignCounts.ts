import { PrismaService } from './prisma.service'

// The numbers of a campaign for a time range (.plan/lead-pipeline-p5-campaign-page.md), read from state the earlier phases already keep. The
// funnel counts people by the label of the campaign and invites by the workflows that planned them. One place, so the page and the daily
// rollup count the same way.

export type CampaignScope = { userId: string; label: string; workflowIds: string[] }

export type RangeCounts = {
   found: number
   qualified: number
   invited: number
   accepted: number
   messaged: number
   replied: number
   handedOver: number
   draftsMade: number
   draftsApproved: number
   draftsRejected: number
   draftsExpired: number
   aiCostMicros: number
}

export const countsFor = async (scope: CampaignScope, from: Date, to: Date): Promise<RangeCounts> => {
   const db = PrismaService.client
   const people = {
      userId: scope.userId,
      labels: { has: scope.label },
   }
   const within = {
      gte: from,
      lt: to,
   }
   const invites = {
      userId: scope.userId,
      originWorkflowId: { in: scope.workflowIds },
   }
   const drafts = {
      userId: scope.userId,
      originWorkflowId: { in: scope.workflowIds },
   }
   const [found, qualified, invited, accepted, messaged, replied, handedOver, made, approved, rejected, expired, cost] =
      await Promise.all([
         db.person.count({
            where: {
               ...people,
               firstSeenAt: within,
            },
         }),
         db.person.count({
            where: {
               ...people,
               firstSeenAt: within,
               fit: 'STRONG',
            },
         }),
         db.linkedInInvite.findMany({
            where: {
               ...invites,
               invitedAt: within,
            },
            distinct: ['slug'],
            select: { slug: true },
         }),
         db.linkedInInvite.findMany({
            where: {
               ...invites,
               acceptedAt: within,
            },
            distinct: ['slug'],
            select: { slug: true },
         }),
         db.person.count({
            where: {
               ...people,
               lastSentAt: within,
            },
         }),
         db.person.count({
            where: {
               ...people,
               lastSentAt: { not: null },
               lastReceivedAt: within,
            },
         }),
         db.person.count({
            where: {
               ...people,
               labels: { hasEvery: [scope.label, 'handed-off'] },
               updatedAt: within,
            },
         }),
         db.draft.count({
            where: {
               ...drafts,
               draftedAt: within,
            },
         }),
         db.draft.count({
            where: {
               ...drafts,
               state: 'APPROVED',
               decidedAt: within,
            },
         }),
         db.draft.count({
            where: {
               ...drafts,
               state: 'REJECTED',
               decidedAt: within,
            },
         }),
         db.draft.count({
            where: {
               ...drafts,
               state: 'EXPIRED',
               expiresAt: within,
            },
         }),
         db.draft.aggregate({
            where: {
               ...drafts,
               draftedAt: within,
            },
            _sum: { costMicros: true },
         }),
      ])

   return {
      found,
      qualified,
      invited: invited.length,
      accepted: accepted.length,
      messaged,
      replied,
      handedOver,
      draftsMade: made,
      draftsApproved: approved,
      draftsRejected: rejected,
      draftsExpired: expired,
      aiCostMicros: cost._sum.costMicros ?? 0,
   }
}
