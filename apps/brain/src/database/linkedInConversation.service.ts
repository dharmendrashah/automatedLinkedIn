import { type Prisma } from 'generated/prisma/client'

import { type MessagesFile } from '@automatedLinkedIn/contracts'

import { summaryOf, timelineOf } from './conversationImport'
import { PrismaService } from './prisma.service'

// The page loads this many of the owner's newest conversations, each with its latest messages; the whole conversation loads when
// it is opened (.plan/unibox-backend.md, Q4).
export const LIST_LIMIT = 3000
const LIST_MESSAGES = 3
const OPEN_MESSAGES = 500
export const MAX_IDS = 500

type Person = {
   name: string
   profileUrl?: string
   imageUrl?: string
}

const personsOf = (value: unknown): Person[] =>
   Array.isArray(value)
      ? (value as unknown[]).flatMap(item => {
           if (typeof item !== 'object' || item === null || typeof (item as { name?: unknown }).name !== 'string') {
              return []
           }

           const { name, profileUrl, imageUrl } = item as Record<string, unknown>

           return [
              {
                 name: name as string,
                 ...(typeof profileUrl === 'string' && { profileUrl }),
                 ...(typeof imageUrl === 'string' && { imageUrl }),
              },
           ]
        })
      : []

const messageSelect = {
   id: true,
   direction: true,
   senderName: true,
   sentAt: true,
   whenText: true,
   text: true,
   attachments: true,
} satisfies Prisma.LinkedInMessageSelect

// Oldest first on the page; newest first when taking the latest few.
const NEWEST_FIRST: Prisma.LinkedInMessageOrderByWithRelationInput[] = [{ sentAt: 'desc' }, { position: 'desc' }]

type MessageRow = Prisma.LinkedInMessageGetPayload<{ select: typeof messageSelect }>

const messageOut = (message: MessageRow) => ({
   id: message.id,
   direction: message.direction,
   sender: message.senderName,
   sentAt: message.sentAt ?? new Date(0),
   when: message.whenText,
   text: message.text,
   attachments: Array.isArray(message.attachments)
      ? (message.attachments as unknown[]).flatMap(item => {
           const { kind, name } = (item ?? {}) as { kind?: unknown; name?: unknown }

           return typeof kind === 'string'
              ? [
                   {
                      kind,
                      ...(typeof name === 'string' && { name }),
                   },
                ]
              : []
        })
      : [],
})

const conversationSelect = {
   id: true,
   accountId: true,
   kind: true,
   title: true,
   participants: true,
   unread: true,
   complete: true,
   messageCount: true,
   lastMessageAt: true,
   waitingSince: true,
   lastReplyAt: true,
   doneMessageCount: true,
} satisfies Prisma.LinkedInConversationSelect

type ConversationRow = Prisma.LinkedInConversationGetPayload<{ select: typeof conversationSelect }>

const conversationOut = (row: ConversationRow, messages: MessageRow[]) => ({
   id: row.id,
   accountId: row.accountId,
   kind: row.kind,
   title: row.title,
   participants: personsOf(row.participants),
   unread: row.unread,
   complete: row.complete,
   messageCount: row.messageCount,
   lastMessageAt: row.lastMessageAt,
   waitingSince: row.waitingSince,
   lastReplyAt: row.lastReplyAt,
   // Closed by the owner, and nothing came after.
   done: row.doneMessageCount !== null && row.doneMessageCount === row.messageCount,
   messages: messages.map(messageOut),
})

export type ConversationView = ReturnType<typeof conversationOut>

// The conversations of the owner's accounts, as the spider read them, and the owner's marks on them. Every call is scoped to the
// owner, so a foreign id is answered like a missing one. See .plan/unibox-backend.md.
export class LinkedInConversationService {
   // The newest conversations with their latest messages, oldest of those first.
   public static async list(userId: string, accountIds?: string[]) {
      const rows = await PrismaService.client.linkedInConversation.findMany({
         where: {
            userId,
            ...(accountIds && { accountId: { in: accountIds } }),
         },
         orderBy: [
            {
               lastMessageAt: {
                  sort: 'desc',
                  nulls: 'last',
               },
            },
            { id: 'desc' },
         ],
         take: LIST_LIMIT,
         select: {
            ...conversationSelect,
            messages: {
               orderBy: NEWEST_FIRST,
               take: LIST_MESSAGES,
               select: messageSelect,
            },
         },
      })

      return rows.map(({ messages, ...row }) => conversationOut(row, messages.toReversed()))
   }

   // One conversation with its newest messages (at most 500), oldest first; null for one that is not the owner's.
   public static async get(userId: string, id: string) {
      const row = await PrismaService.client.linkedInConversation.findFirst({
         where: {
            id,
            userId,
         },
         select: {
            ...conversationSelect,
            messages: {
               orderBy: NEWEST_FIRST,
               take: OPEN_MESSAGES,
               select: messageSelect,
            },
         },
      })

      if (!row) {
         return null
      }

      const { messages, ...rest } = row

      return {
         ...conversationOut(rest, messages.toReversed()),
         // True when older messages were stored but not sent.
         truncated: row.messageCount > messages.length,
      }
   }

   // The owner's own mark. It changes nothing on LinkedIn.
   public static async setUnread(userId: string, ids: string[], unread: boolean) {
      const { count } = await PrismaService.client.linkedInConversation.updateMany({
         where: {
            userId,
            id: { in: ids },
            unread: !unread,
         },
         data: {
            unread,
            readAt: unread ? null : new Date(),
         },
      })

      return count
   }

   // Closes conversations without a reply, or opens them again. A new message reopens a closed one by itself, because the mark is
   // the number of messages there were.
   public static async setDone(userId: string, ids: string[], done: boolean) {
      if (!done) {
         const { count } = await PrismaService.client.linkedInConversation.updateMany({
            where: {
               userId,
               id: { in: ids },
            },
            data: {
               doneAt: null,
               doneMessageCount: null,
            },
         })

         return count
      }

      return PrismaService.client.$executeRaw`
         UPDATE "LinkedInConversation"
         SET "doneAt" = now(), "doneMessageCount" = "messageCount"
         WHERE "userId" = ${userId} AND "id" = ANY(${ids}::text[])`
   }

   // Stores what a run read for one account: new conversations and messages are added, ones already there are left as they
   // are, so storing the same file again changes nothing. `userId` and `accountId` come from the session, never from the file.
   public static async store(owner: { userId: string; accountId: string }, file: MessagesFile) {
      const base = new Date(file.captured_at)
      let conversations = 0
      let messages = 0

      for (const conversation of file.conversations) {
         const added = await PrismaService.client.$transaction(async tx => {
            const existing = await tx.linkedInConversation.findUnique({
               where: {
                  accountId_linkedInId: {
                     accountId: owner.accountId,
                     linkedInId: conversation.id,
                  },
               },
               select: {
                  id: true,
                  unread: true,
                  complete: true,
               },
            })
            const [first] = conversation.participants
            const data = {
               title: conversation.title,
               kind: conversation.kind,
               participants: conversation.participants as Prisma.InputJsonArray,
               contactProfileUrl: first?.profileUrl ?? null,
               complete: (existing?.complete ?? false) || conversation.complete,
            }
            const row =
               existing ??
               (await tx.linkedInConversation.create({
                  data: {
                     ...data,
                     userId: owner.userId,
                     accountId: owner.accountId,
                     linkedInId: conversation.id,
                     unread: conversation.unread,
                  },
                  select: {
                     id: true,
                     unread: true,
                     complete: true,
                  },
               }))
            const known = new Set(
               (
                  await tx.linkedInMessage.findMany({
                     where: { conversationId: row.id },
                     select: { linkedInId: true },
                  })
               ).map(({ linkedInId }) => linkedInId)
            )
            const times = timelineOf(conversation.messages, base)
            const fresh = conversation.messages.flatMap((message, position) =>
               known.has(message.id)
                  ? []
                  : [
                       {
                          conversationId: row.id,
                          linkedInId: message.id,
                          direction: message.direction,
                          senderName: message.sender.name,
                          senderProfileUrl: message.sender.profileUrl ?? null,
                          sentAt: times[position] ?? base,
                          whenText: message.when,
                          text: message.text,
                          attachments: message.attachments as Prisma.InputJsonArray,
                          position,
                       },
                    ]
            )

            await tx.linkedInMessage.createMany({
               data: fresh,
               skipDuplicates: true,
            })

            const all = await tx.linkedInMessage.findMany({
               where: { conversationId: row.id },
               orderBy: [{ sentAt: 'asc' }, { position: 'asc' }],
               select: {
                  direction: true,
                  sentAt: true,
               },
            })
            const newFromThem = fresh.some(message => message.direction === 'THEM')

            await tx.linkedInConversation.update({
               where: { id: row.id },
               data: {
                  ...data,
                  ...summaryOf(
                     all.map(({ direction, sentAt }) => ({
                        direction,
                        sentAt: sentAt ?? base,
                     }))
                  ),
                  // LinkedIn's unread mark counts again only when something new came from them; the owner's own mark stays.
                  unread: existing ? row.unread || (newFromThem && conversation.unread) : conversation.unread,
                  importedAt: new Date(),
               },
            })

            return fresh.length
         })

         conversations += 1
         messages += added
      }

      const { account } = file

      await PrismaService.client.linkedInAccount.update({
         where: { id: owner.accountId },
         data: {
            messagesReadAt: new Date(),
            ...(account && { displayName: account.name }),
            ...(account?.imageUrl && { imageUrl: account.imageUrl }),
         },
      })

      return {
         conversations,
         messages,
      }
   }

   // The owner's accounts with what the Unibox shows about each.
   public static async accounts(userId: string) {
      const [accounts, counts] = await Promise.all([
         PrismaService.client.linkedInAccount.findMany({
            where: { userId },
            select: {
               id: true,
               email: true,
               status: true,
               displayName: true,
               imageUrl: true,
               messagesReadAt: true,
            },
            orderBy: { createdAt: 'asc' },
         }),
         PrismaService.client.linkedInConversation.groupBy({
            by: ['accountId'],
            where: {
               userId,
               unread: true,
            },
            _count: { _all: true },
         }),
      ])
      const unread = new Map(counts.map(({ accountId, _count }) => [accountId, _count._all]))

      return accounts.map(account => ({
         ...account,
         unread: unread.get(account.id) ?? 0,
      }))
   }
}
