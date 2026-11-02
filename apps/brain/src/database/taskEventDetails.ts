import { person } from 'core/workflowItem'
import { type ConversationItem, type ItemFacts, type WorkflowItemData } from 'core/workflowItem'

import { PrismaService } from './prisma.service'

// What a task event says beyond the envelope, read from the rows the task's import stored (.plan/workflow-events-and-hooks.md). Counts go
// in the JSON; the people and their words are items. Read only. A task with nothing declared has no entry here.

export type EventDetails = {
   counts: Record<string, number>
   items: WorkflowItemData[]
}

export type DetailsSession = { id: string; userId: string; linkedInAccountId: string; startedAt: Date }

const MAX_CONVERSATIONS = 50
const WORDS_LENGTH = 500

const SLUG_IN_LINK = /linkedin\.com\/in\/([^/?#\s]+)/i

const tally = (values: string[]) => {
   const counts: Record<string, number> = {}

   for (const value of values) {
      counts[value] = (counts[value] ?? 0) + 1
   }

   return counts
}

type InviteRow = {
   slug: string
   name: string
   state: string
   noteSent: boolean | null
   originWorkflowId: string | null
}

const inviteOutcome = (row: InviteRow) => {
   if (row.state === 'SENT' || row.state === 'ACCEPTED') {
      return row.noteSent === false ? 'SENT_WITHOUT_NOTE' : 'SENT'
   }

   if (row.state === 'WITHDRAWN') {
      return 'WITHDRAWN'
   }

   return row.state === 'UNKNOWN' || row.state === 'SENDING' ? 'UNKNOWN' : 'NOT_SENT'
}

const invites = async (session: DetailsSession): Promise<EventDetails> => {
   const rows = await PrismaService.client.linkedInInvite.findMany({
      where: {
         sessionId: session.id,
         userId: session.userId,
      },
      select: {
         slug: true,
         name: true,
         state: true,
         noteSent: true,
         originWorkflowId: true,
      },
      orderBy: { id: 'asc' },
      take: 100,
   })

   return {
      counts: tally(rows.map(inviteOutcome)),
      items: rows.map(row => {
         const facts: ItemFacts = {
            'item.outcome': inviteOutcome(row),
            'item.noteSent': row.noteSent,
            'item.plannedBy': row.originWorkflowId,
         }

         return person({
            slug: row.slug,
            url: `https://www.linkedin.com/in/${row.slug}`,
            name: row.name,
            known: true,
            facts,
         })
      }),
   }
}

const replies = async (session: DetailsSession): Promise<EventDetails> => {
   const reply = await PrismaService.client.linkedInReply.findFirst({
      where: {
         sessionId: session.id,
         userId: session.userId,
      },
      select: {
         state: true,
         conversationId: true,
         recipientSlug: true,
         recipientName: true,
      },
   })

   if (!reply) {
      return {
         counts: {},
         items: [],
      }
   }

   const state = reply.state === 'SENT' || reply.state === 'FAILED' ? reply.state : 'UNKNOWN'
   const facts: ItemFacts = { 'item.state': state }
   const conversation = reply.conversationId
      ? await PrismaService.client.linkedInConversation.findFirst({
           where: {
              id: reply.conversationId,
              userId: session.userId,
           },
           select: {
              id: true,
              linkedInId: true,
              title: true,
           },
        })
      : null

   return {
      counts: { [state]: 1 },
      items: conversation
         ? [
              {
                 kind: 'conversation',
                 slug: conversation.id,
                 url: `https://www.linkedin.com/messaging/thread/${encodeURIComponent(conversation.linkedInId)}/`,
                 personSlug: reply.recipientSlug,
                 name: conversation.title,
                 headline: null,
                 lastText: null,
                 lastAt: null,
                 lastFrom: 'ME',
                 unread: false,
                 facts,
              },
           ]
         : reply.recipientSlug
           ? [
                person({
                   slug: reply.recipientSlug,
                   url: `https://www.linkedin.com/in/${reply.recipientSlug}`,
                   name: reply.recipientName,
                   known: true,
                   facts,
                }),
             ]
           : [],
   }
}

type Participant = { name?: unknown }

const nameOf = (participants: unknown, title: string) => {
   const [first] = Array.isArray(participants) ? (participants as Participant[]) : []

   return typeof first?.name === 'string' && first.name !== '' ? first.name : title
}

// The conversations that got a new message from the other person in this read. The first read of an account stores its whole history, so it
// is a baseline and gives none. A message "is new" when this read stored it, never by its clock: LinkedIn's times are the account's wall time.
const messages = async (session: DetailsSession): Promise<EventDetails> => {
   const db = PrismaService.client
   const earlier = await db.messageImport.count({
      where: {
         status: 'DONE',
         sessionId: { not: session.id },
         session: { linkedInAccountId: session.linkedInAccountId },
      },
   })

   if (earlier === 0) {
      return {
         counts: {
            conversations: 0,
            newMessages: 0,
            truncated: 0,
         },
         items: [],
      }
   }

   const fresh = await db.linkedInMessage.findMany({
      where: {
         direction: 'THEM',
         createdAt: { gte: session.startedAt },
         conversation: {
            userId: session.userId,
            accountId: session.linkedInAccountId,
         },
      },
      orderBy: [{ conversationId: 'asc' }, { position: 'desc' }],
      select: {
         conversationId: true,
         text: true,
         sentAt: true,
         conversation: {
            select: {
               id: true,
               linkedInId: true,
               title: true,
               participants: true,
               contactProfileUrl: true,
               unread: true,
            },
         },
      },
   })
   const byConversation = new Map<string, typeof fresh>()

   for (const message of fresh) {
      byConversation.set(message.conversationId, [...(byConversation.get(message.conversationId) ?? []), message])
   }

   const taken = [...byConversation.values()].slice(0, MAX_CONVERSATIONS)

   return {
      counts: {
         conversations: byConversation.size,
         newMessages: fresh.length,
         truncated: Math.max(0, byConversation.size - taken.length),
      },
      items: taken.flatMap(([newest, ...rest]): ConversationItem[] =>
         newest
            ? [
                 {
                    kind: 'conversation',
                    slug: newest.conversation.id,
                    url: `https://www.linkedin.com/messaging/thread/${encodeURIComponent(newest.conversation.linkedInId)}/`,
                    personSlug: newest.conversation.contactProfileUrl
                       ? (SLUG_IN_LINK.exec(newest.conversation.contactProfileUrl)?.[1] ?? null)
                       : null,
                    name: nameOf(newest.conversation.participants, newest.conversation.title),
                    headline: null,
                    lastText: [newest, ...rest]
                       .map(({ text }) => text)
                       .join('\n')
                       .slice(0, WORDS_LENGTH),
                    lastAt: newest.sentAt?.toISOString() ?? null,
                    lastFrom: 'THEM',
                    unread: newest.conversation.unread,
                    facts: { 'item.direction': 'THEM' },
                 },
              ]
            : []
      ),
   }
}

const BUILDERS: Record<string, (session: DetailsSession) => Promise<EventDetails>> = {
   'linkedin-invite': invites,
   'linkedin-reply': replies,
   'linkedin-message': replies,
   'linkedin-messages': messages,
}

export const hasDetails = (task: string) => task in BUILDERS

export const detailsOf = (task: string, session: DetailsSession): Promise<EventDetails | null> => {
   const build = BUILDERS[task]

   return build ? build(session) : Promise.resolve(null)
}

// Whether the task's own import still has to store what the run read; an after event waits for it, up to 15 minutes.
export const importPending = async (task: string, sessionId: string): Promise<boolean> => {
   const db = PrismaService.client
   const where = {
      sessionId,
      status: 'PENDING' as const,
   }

   switch (task) {
      case 'linkedin-invite':
         return (await db.inviteImport.count({ where })) > 0
      case 'linkedin-messages':
         return (await db.messageImport.count({ where })) > 0
      case 'linkedin-invitations':
         return (await db.invitationImport.count({ where })) > 0
      case 'linkedin-connections':
         return (await db.connectionImport.count({ where })) > 0
      case 'linkedin-profile':
         return (await db.profileImport.count({ where })) > 0
      default:
         return false
   }
}
