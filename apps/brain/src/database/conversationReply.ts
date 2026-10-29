import { PrismaService } from './prisma.service'

// How far back a reply that did not go is still shown to the owner (.plan/unibox-sending-after-reload.md).
const WINDOW_MS = 24 * 60 * 60 * 1000

// What the page shows of the reply of a conversation: one waiting or being sent, or one that did not go (or may not have) and was not
// dismissed. `files` are only what was asked to go (names and sizes), never the files themselves.
export type ConversationReply = {
   id: string
   state: 'QUEUED' | 'SENDING' | 'FAILED' | 'UNKNOWN'
   text: string
   files: Array<{ name: string; kind: string; bytes?: number }>
   startedAt: Date
   failure: string | null
   // Why a queued reply has not started and the earliest it can, when brain knows.
   wait: { reason: string; until: Date; zone: string | null } | null
}

const filesOf = (stored: unknown): ConversationReply['files'] =>
   Array.isArray(stored)
      ? (stored as unknown[]).flatMap(item => {
           const { name, kind, bytes } = (item ?? {}) as { name?: unknown; kind?: unknown; bytes?: unknown }

           return typeof name === 'string' && typeof kind === 'string'
              ? [
                   {
                      name,
                      kind,
                      ...(typeof bytes === 'number' && { bytes }),
                   },
                ]
              : []
        })
      : []

// The newest reply of each conversation of the owner in the last day, by conversation id. A reply that went, one that was dismissed
// and a failure followed by a newer reply say nothing: only the newest counts. A reply still queued is shown however long ago it was asked,
// since it can wait for the account's working hours.
export const latestReplies = async (userId: string) => {
   const rows = await PrismaService.client.linkedInReply.findMany({
      where: {
         userId,
         OR: [{ createdAt: { gte: new Date(Date.now() - WINDOW_MS) } }, { state: 'QUEUED' }],
      },
      orderBy: { createdAt: 'desc' },
      distinct: ['conversationId'],
      select: {
         id: true,
         conversationId: true,
         state: true,
         text: true,
         attachments: true,
         failure: true,
         createdAt: true,
         dismissedAt: true,
         waitReason: true,
         waitUntil: true,
         waitZone: true,
      },
   })
   const replies = new Map<string, ConversationReply>()

   for (const row of rows) {
      // A first message waiting for its conversation is listed on its own (`pendingFirstMessages`).
      if (!row.conversationId || !shown(row)) {
         continue
      }

      replies.set(row.conversationId, viewOf(row))
   }

   return replies
}

type Row = {
   id: string
   state: 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED' | 'UNKNOWN'
   text: string
   attachments: unknown
   failure: string | null
   createdAt: Date
   dismissedAt: Date | null
   waitReason: string | null
   waitUntil: Date | null
   waitZone: string | null
}

// On its way, or one that did not go and was not dismissed; one that went says nothing.
const shown = (row: Row): row is Row & { state: ConversationReply['state'] } =>
   row.state !== 'SENT' && (row.state === 'SENDING' || row.state === 'QUEUED' || row.dismissedAt === null)

const viewOf = (row: Row & { state: ConversationReply['state'] }): ConversationReply => ({
   id: row.id,
   state: row.state,
   text: row.text,
   files: filesOf(row.attachments),
   startedAt: row.createdAt,
   failure: row.failure,
   wait:
      row.state === 'QUEUED' && row.waitReason && row.waitUntil
         ? {
              reason: row.waitReason,
              until: row.waitUntil,
              zone: row.waitZone,
           }
         : null,
})

// The owner's first messages to connections that have no conversation yet (.plan/message-connections.md): the newest one to each person,
// on its way or not gone, so the page shows it after a reload until its conversation is stored or the owner dismisses it.
export const pendingFirstMessages = async (userId: string, accountIds?: string[]) => {
   const rows = await PrismaService.client.linkedInReply.findMany({
      where: {
         userId,
         account: { userId },
         ...(accountIds && { accountId: { in: accountIds } }),
         conversationId: null,
         recipientSlug: { not: null },
         OR: [{ createdAt: { gte: new Date(Date.now() - WINDOW_MS) } }, { state: 'QUEUED' }],
      },
      orderBy: { createdAt: 'desc' },
      distinct: ['accountId', 'recipientSlug'],
      select: {
         id: true,
         accountId: true,
         recipientSlug: true,
         recipientName: true,
         state: true,
         text: true,
         attachments: true,
         failure: true,
         createdAt: true,
         dismissedAt: true,
         waitReason: true,
         waitUntil: true,
         waitZone: true,
      },
   })

   return rows.flatMap(row =>
      row.recipientSlug && shown(row)
         ? [
              {
                 accountId: row.accountId,
                 slug: row.recipientSlug,
                 name: row.recipientName ?? row.recipientSlug,
                 reply: viewOf(row),
              },
           ]
         : []
   )
}
