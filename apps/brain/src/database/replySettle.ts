import { type Prisma } from 'generated/prisma/client'

type Tx = Prisma.TransactionClient

export const words = (text: string) => text.replace(/\s+/g, ' ').trim()

// How far back a reply that was not sure is looked at again (.plan/reply-confirmation.md).
export const SETTLE_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

// A reply that was not sure to have gone did go when the conversation holds a message of the account with its words that was stored
// after the reply was asked for. Both times are brain's own, never LinkedIn's wall-clock. One message settles one reply, earliest
// reply first, so two replies with the same words need two messages; a reply the owner dismissed is left alone. Safe to repeat.
export const settleUnsureReplies = async (tx: Tx, conversationId: string, now = new Date()) => {
   const replies = await tx.linkedInReply.findMany({
      where: {
         conversationId,
         state: 'UNKNOWN',
         dismissedAt: null,
         createdAt: { gte: new Date(now.getTime() - SETTLE_DAYS * DAY_MS) },
      },
      orderBy: { createdAt: 'asc' },
      select: {
         id: true,
         text: true,
         createdAt: true,
      },
   })

   if (replies.length === 0) {
      return 0
   }

   const mine = await tx.linkedInMessage.findMany({
      where: {
         conversationId,
         direction: 'ME',
         createdAt: { gte: replies[0].createdAt },
      },
      orderBy: [{ createdAt: 'asc' }, { position: 'asc' }],
      select: {
         text: true,
         createdAt: true,
      },
   })
   const taken = new Set<number>()
   const settled: string[] = []

   for (const reply of replies) {
      const wanted = words(reply.text)
      // A reply of files only has no words to find; the files of a stored message settle it elsewhere.
      const at =
         wanted === ''
            ? -1
            : mine.findIndex(
                 (message, index) =>
                    !taken.has(index) && message.createdAt >= reply.createdAt && words(message.text) === wanted
              )

      if (at >= 0) {
         taken.add(at)
         settled.push(reply.id)
      }
   }

   if (settled.length > 0) {
      await tx.linkedInReply.updateMany({
         where: {
            id: { in: settled },
            state: 'UNKNOWN',
         },
         data: {
            state: 'SENT',
            sentAt: now,
            failure: null,
         },
      })
   }

   return settled.length
}
