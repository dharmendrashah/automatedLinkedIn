import { PrismaService } from './prisma.service'

// What the "Send message" and "Reply in a conversation" blocks read (.plan/account-action-blocks.md): the messages and replies
// themselves go through the owner's reply queue (`LinkedInReplyService`, which keeps the daily limits); this finds who may be written
// to and where each message stands. Every call is scoped to the owner.

const COUNTED = ['QUEUED', 'SENDING', 'SENT', 'UNKNOWN'] as const

export type MessageStanding = { status: 'WAITING' | 'DONE' | 'FAILED' | 'UNSURE'; reason: string | null }

export class ReplyActService {
   // Where each asked message stands, by its id.
   public static async standing(userId: string, ids: string[]) {
      const rows = await PrismaService.client.linkedInReply.findMany({
         where: {
            userId,
            id: { in: ids },
         },
         select: {
            id: true,
            state: true,
            failure: true,
         },
      })

      return new Map(
         rows.map(row => [
            row.id,
            (row.state === 'SENT'
               ? {
                    status: 'DONE',
                    reason: null,
                 }
               : row.state === 'UNKNOWN'
                 ? {
                      status: 'UNSURE',
                      reason: row.failure,
                   }
                 : row.state === 'FAILED'
                   ? {
                        status: 'FAILED',
                        reason: row.failure,
                     }
                   : {
                        status: 'WAITING',
                        reason: null,
                     }) satisfies MessageStanding,
         ])
      )
   }

   // For each person, the first of these accounts (in the order given) they are a connection of.
   public static async connectedVia(userId: string, accountIds: string[], slugs: string[]) {
      const rows = await PrismaService.client.linkedInConnection.findMany({
         where: {
            userId,
            account: { userId },
            accountId: { in: accountIds },
            slug: { in: slugs },
            status: { notIn: ['REMOVED', 'GONE'] },
         },
         select: {
            slug: true,
            accountId: true,
         },
      })
      const via = new Map<string, string>()

      for (const accountId of accountIds) {
         for (const row of rows.filter(each => each.accountId === accountId && !via.has(each.slug))) {
            via.set(row.slug, accountId)
         }
      }

      return via
   }

   // The conversations that are the owner's, with what the guards need: its account and who wrote last.
   public static conversations(userId: string, ids: string[]) {
      return PrismaService.client.linkedInConversation.findMany({
         where: {
            userId,
            id: { in: ids },
            account: { userId },
         },
         select: {
            id: true,
            accountId: true,
            lastDirection: true,
         },
      })
   }

   // The company My network knows for each of these people, for the words of a message.
   public static async companies(userId: string, slugs: string[]) {
      const rows = await PrismaService.client.person.findMany({
         where: {
            userId,
            slug: { in: slugs },
            company: { not: null },
         },
         select: {
            slug: true,
            company: true,
         },
      })

      return new Map(rows.flatMap(({ slug, company }) => (company ? [[slug, company] as const] : [])))
   }

   // Where a message already went (or waits) lately: a conversation id for a reply, `accountId:slug` for a first message.
   public static async recent(
      userId: string,
      hours: number,
      where: { conversationIds: string[]; accountIds: string[]; slugs: string[] }
   ) {
      const rows = await PrismaService.client.linkedInReply.findMany({
         where: {
            userId,
            state: { in: [...COUNTED] },
            createdAt: { gte: new Date(Date.now() - hours * 60 * 60 * 1000) },
            OR: [
               { conversationId: { in: where.conversationIds } },
               {
                  accountId: { in: where.accountIds },
                  recipientSlug: { in: where.slugs },
               },
            ],
         },
         select: {
            conversationId: true,
            accountId: true,
            recipientSlug: true,
         },
      })

      return new Set(
         rows.flatMap(row => [
            ...(row.conversationId ? [row.conversationId] : []),
            ...(row.recipientSlug ? [`${row.accountId}:${row.recipientSlug}`] : []),
         ])
      )
   }
}
