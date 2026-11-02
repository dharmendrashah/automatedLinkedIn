import { CONVERSATION_EXCERPT } from 'core/workflowItem'

import { MESSAGES_TASK } from './linkedInMessages.hooks'
import { MessagesRefresh } from './messagesRefresh'
import { PrismaService } from './prisma.service'
import { type ReadState, readStateOf } from './readState'
import { TaskRefusedError } from './taskErrors'

// What the "Get my conversations" block asks and reads (.plan/account-action-blocks.md): the conversations of the accounts with the
// last message shortened, from their `linkedin-messages` read. Only the person and the last words leave the Unibox; never files.

const SLUG_IN_LINK = /linkedin\.com\/in\/([^/?#\s]+)/i

type Participant = { name?: unknown }

const nameOf = (participants: unknown, title: string) => {
   const [first] = Array.isArray(participants) ? (participants as Participant[]) : []

   return typeof first?.name === 'string' && first.name !== '' ? first.name : title
}

export class ConversationReadService {
   // Asks the account's read; throws the sentence when it cannot be asked.
   public static async ask(userId: string, accountId: string) {
      const { started, skipped } = await MessagesRefresh.request(userId, [accountId])

      if (skipped[0]) {
         throw new TaskRefusedError(skipped[0].reason)
      }

      return started > 0
   }

   public static state(accountId: string, since: Date): Promise<ReadState> {
      return readStateOf(accountId, MESSAGES_TASK, since)
   }

   // The newest conversations of the accounts, with the last message of each shortened.
   public static async conversations(userId: string, accountIds: string[], take: number) {
      const rows = await PrismaService.client.linkedInConversation.findMany({
         where: {
            userId,
            accountId: { in: accountIds },
            account: { userId },
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
         take,
         select: {
            id: true,
            linkedInId: true,
            title: true,
            participants: true,
            contactProfileUrl: true,
            unread: true,
            lastMessageAt: true,
            lastDirection: true,
            messages: {
               orderBy: [{ sentAt: 'desc' }, { position: 'desc' }],
               take: 1,
               select: { text: true },
            },
         },
      })

      return rows.map(row => ({
         id: row.id,
         url: `https://www.linkedin.com/messaging/thread/${encodeURIComponent(row.linkedInId)}/`,
         personSlug: row.contactProfileUrl ? (SLUG_IN_LINK.exec(row.contactProfileUrl)?.[1] ?? null) : null,
         name: nameOf(row.participants, row.title),
         lastText: row.messages[0]?.text ? row.messages[0].text.slice(0, CONVERSATION_EXCERPT) : null,
         lastAt: row.lastMessageAt?.toISOString() ?? null,
         lastFrom: row.lastDirection,
         unread: row.unread,
      }))
   }
}
