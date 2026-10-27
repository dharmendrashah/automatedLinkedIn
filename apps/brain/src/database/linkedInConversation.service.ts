import { KeptFiles } from 'core'

import { type Prisma } from 'generated/prisma/client'

import { type MessagesFile, keptPrefix, sentKey } from '@automatedLinkedIn/contracts'

import { summaryOf, timelineOf } from './conversationImport'
import { type ConversationReply, latestReplies } from './conversationReply'
import { PrismaService } from './prisma.service'
import { settleUnsureReplies, words } from './replySettle'

type Tx = Prisma.TransactionClient

const hasKey = (attachments: unknown) =>
   Array.isArray(attachments) &&
   (attachments as unknown[]).some(item => typeof (item as { key?: unknown } | null)?.key === 'string')

// The files of a reply as the message that went with it shows them, with the place they are kept.
const filesOfReply = (owner: { userId: string; accountId: string }, uploadId: string, stored: unknown) =>
   Array.isArray(stored)
      ? (stored as unknown[]).flatMap(item => {
           const { name, kind, bytes } = (item ?? {}) as { name?: unknown; kind?: unknown; bytes?: unknown }

           return typeof name === 'string' && typeof kind === 'string'
              ? [
                   {
                      kind,
                      name,
                      ...(typeof bytes === 'number' && { bytes }),
                      key: sentKey(owner.userId, owner.accountId, uploadId, name),
                   },
                ]
              : []
        })
      : []

// The messages of the account that LinkedIn now shows are matched to the replies that sent them: the earliest reply with files, not
// matched yet, that has the same words. The message then shows the reply's own files, which are the true ones. Resolves to the replies used.
const giveReplyFiles = async (
   tx: Tx,
   owner: { userId: string; accountId: string },
   conversationId: string,
   fresh: Array<{ direction: string; text: string; attachments: Prisma.InputJsonArray }>
) => {
   const replies = await tx.linkedInReply.findMany({
      where: {
         conversationId,
         uploadId: { not: null },
         matchedAt: null,
         state: { in: ['SENT', 'UNKNOWN'] },
      },
      orderBy: { createdAt: 'asc' },
      select: {
         id: true,
         text: true,
         uploadId: true,
         attachments: true,
      },
   })
   const used: string[] = []

   for (const message of fresh) {
      const at = message.direction === 'ME' ? replies.findIndex(reply => words(reply.text) === words(message.text)) : -1
      const [reply] = at < 0 ? [] : replies.splice(at, 1)

      if (reply) {
         message.attachments = filesOfReply(owner, reply.uploadId ?? '', reply.attachments) as Prisma.InputJsonArray
         used.push(reply.id)
      }
   }

   return used
}
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
           const { kind, name, bytes, key } = (item ?? {}) as {
              kind?: unknown
              name?: unknown
              bytes?: unknown
              key?: unknown
           }

           return typeof kind === 'string'
              ? [
                   {
                      kind,
                      ...(typeof name === 'string' && { name }),
                      ...(typeof bytes === 'number' && { bytes }),
                      // The key itself never leaves brain; the page asks for a link to open the file.
                      ...(typeof key === 'string' && { kept: true }),
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

const conversationOut = (row: ConversationRow, messages: MessageRow[], reply?: ConversationReply) => ({
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
   // The reply being sent, or the one that did not go and was not dismissed, so the page shows it after a reload.
   ...(reply && { reply }),
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

      const replies = await latestReplies(userId)

      return rows.map(({ messages, ...row }) => conversationOut(row, messages.toReversed(), replies.get(row.id)))
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
      const replies = await latestReplies(userId)

      return {
         ...conversationOut(rest, messages.toReversed(), replies.get(row.id)),
         // True when older messages were stored but not sent.
         truncated: row.messageCount > messages.length,
      }
   }

   // A short link to read one kept file of a message of the owner's, or null when the message is not theirs, has no such attachment
   // or the file was not kept.
   public static async fileLink(userId: string, messageId: string, index: number) {
      const message = await PrismaService.client.linkedInMessage.findFirst({
         where: {
            id: messageId,
            conversation: { userId },
         },
         select: { attachments: true },
      })
      const { key, name } = ((Array.isArray(message?.attachments) ? message.attachments[index] : null) ?? {}) as {
         key?: unknown
         name?: unknown
      }

      return typeof key === 'string' ? KeptFiles.link(userId, key, typeof name === 'string' ? name : 'file') : null
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
      // A file the spider kept counts only inside the folder of this owner and account; any other key is dropped.
      const folder = keptPrefix(owner.userId, owner.accountId)
      const own = ({
         key,
         ...attachment
      }: MessagesFile['conversations'][number]['messages'][number]['attachments'][number]) =>
         key !== undefined && key.startsWith(folder) && !key.includes('..')
            ? {
                 ...attachment,
                 key,
              }
            : attachment
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
               // Left as it was when the file has none (a file of an older spider).
               rowHash: conversation.rowHash,
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
            const known = new Map(
               (
                  await tx.linkedInMessage.findMany({
                     where: { conversationId: row.id },
                     select: {
                        linkedInId: true,
                        attachments: true,
                     },
                  })
               ).map(({ linkedInId, attachments }) => [linkedInId, attachments])
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
                          attachments: message.attachments.map(own) as Prisma.InputJsonArray,
                          position,
                       },
                    ]
            )
            const matched = fresh.some(message => message.direction === 'ME')
               ? await giveReplyFiles(tx, owner, row.id, fresh)
               : []

            await tx.linkedInMessage.createMany({
               data: fresh,
               skipDuplicates: true,
            })

            // A picture kept by a later read than the one that stored its message: the message gets its place, once.
            for (const message of conversation.messages) {
               const incoming = message.attachments.map(own)
               const stored = known.get(message.id)

               if (stored !== undefined && !hasKey(stored) && hasKey(incoming)) {
                  await tx.linkedInMessage.updateMany({
                     where: {
                        conversationId: row.id,
                        linkedInId: message.id,
                     },
                     data: { attachments: incoming as Prisma.InputJsonArray },
                  })
               }
            }

            if (matched.length > 0) {
               await tx.linkedInReply.updateMany({
                  where: { id: { in: matched } },
                  data: { matchedAt: new Date() },
               })
            }

            // A reply that was not sure to have gone is settled by the message that now stands for it, also when an earlier read
            // stored that message.
            await settleUnsureReplies(tx, row.id)

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
               nextMessagesAt: true,
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
