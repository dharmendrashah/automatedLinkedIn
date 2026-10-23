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
// and a failure followed by a newer reply say nothing: only the newest counts.
export const latestReplies = async (userId: string) => {
   const rows = await PrismaService.client.linkedInReply.findMany({
      where: {
         userId,
         createdAt: { gte: new Date(Date.now() - WINDOW_MS) },
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
      },
   })
   const replies = new Map<string, ConversationReply>()

   for (const row of rows) {
      if (row.state === 'SENT' || (row.state !== 'SENDING' && row.state !== 'QUEUED' && row.dismissedAt !== null)) {
         continue
      }

      replies.set(row.conversationId, {
         id: row.id,
         state: row.state,
         text: row.text,
         files: filesOf(row.attachments),
         startedAt: row.createdAt,
         failure: row.failure,
      })
   }

   return replies
}
