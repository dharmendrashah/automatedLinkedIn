import { describe, expect, it, vi } from 'vitest'

import { type Prisma } from 'generated/prisma/client'

import { SETTLE_DAYS, settleUnsureReplies, words } from './replySettle'

const NOW = new Date('2026-10-24T12:00:00Z')
const at = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000)

const setup = (
   replies: Array<{ id: string; text: string; createdAt: Date }>,
   mine: Array<{ text: string; createdAt: Date }>
) => {
   const updateMany = vi.fn().mockResolvedValue({ count: 0 })
   const findReplies = vi.fn().mockResolvedValue(replies)
   const findMessages = vi.fn().mockResolvedValue(mine)
   const tx = {
      linkedInReply: {
         findMany: findReplies,
         updateMany,
      },
      linkedInMessage: { findMany: findMessages },
   } as unknown as Prisma.TransactionClient

   return {
      tx,
      updateMany,
      findReplies,
      findMessages,
   }
}

describe('settleUnsureReplies', () => {
   it('should look only at the unsure replies of this conversation from the last week that the owner did not dismiss', async () => {
      const { tx, findReplies } = setup([], [])

      await expect(settleUnsureReplies(tx, 'c1', NOW)).resolves.toBe(0)

      expect(findReplies).toHaveBeenCalledWith(
         expect.objectContaining({
            where: {
               conversationId: 'c1',
               state: 'UNKNOWN',
               dismissedAt: null,
               createdAt: { gte: new Date(NOW.getTime() - SETTLE_DAYS * 24 * 3_600_000) },
            },
         })
      )
   })

   it('should settle a reply as sent when a message of the account with its words was stored after it was asked for', async () => {
      const { tx, updateMany } = setup(
         [
            {
               id: 'r1',
               text: 'Thanks  Ada,\ntomorrow works.',
               createdAt: at(-2),
            },
         ],
         [
            {
               text: 'Thanks Ada, tomorrow works.',
               createdAt: at(-1),
            },
         ]
      )

      await expect(settleUnsureReplies(tx, 'c1', NOW)).resolves.toBe(1)

      expect(updateMany).toHaveBeenCalledWith({
         where: {
            id: { in: ['r1'] },
            state: 'UNKNOWN',
         },
         data: {
            state: 'SENT',
            sentAt: NOW,
            failure: null,
         },
      })
   })

   it('should not take a message that was stored before the reply was asked for, or one with other words', async () => {
      const { tx, updateMany } = setup(
         [
            {
               id: 'r1',
               text: 'Same words',
               createdAt: at(-2),
            },
         ],
         [
            {
               text: 'Same words',
               createdAt: at(-3),
            },
            {
               text: 'Other words',
               createdAt: at(-1),
            },
         ]
      )

      await expect(settleUnsureReplies(tx, 'c1', NOW)).resolves.toBe(0)
      expect(updateMany).not.toHaveBeenCalled()
   })

   it('should let one message settle one reply, earliest first, so two replies with the same words need two messages', async () => {
      const { tx, updateMany } = setup(
         [
            {
               id: 'r1',
               text: 'Ok',
               createdAt: at(-4),
            },
            {
               id: 'r2',
               text: 'Ok',
               createdAt: at(-3),
            },
            {
               id: 'r3',
               text: 'Ok',
               createdAt: at(-2),
            },
         ],
         [
            {
               text: 'Ok',
               createdAt: at(-3.5),
            },
            {
               text: 'Ok',
               createdAt: at(-1),
            },
         ]
      )

      await expect(settleUnsureReplies(tx, 'c1', NOW)).resolves.toBe(2)

      expect(updateMany.mock.calls[0]?.[0].where.id).toEqual({ in: ['r1', 'r2'] })
   })

   it('should leave a reply of files only, which has no words to find', async () => {
      const { tx, updateMany } = setup(
         [
            {
               id: 'r1',
               text: '',
               createdAt: at(-2),
            },
         ],
         [
            {
               text: '',
               createdAt: at(-1),
            },
         ]
      )

      await expect(settleUnsureReplies(tx, 'c1', NOW)).resolves.toBe(0)
      expect(updateMany).not.toHaveBeenCalled()
   })

   it('should ask for the messages of the account only, from the first reply on', async () => {
      const { tx, findMessages } = setup(
         [
            {
               id: 'r1',
               text: 'Hi',
               createdAt: at(-2),
            },
         ],
         []
      )

      await settleUnsureReplies(tx, 'c1', NOW)

      expect(findMessages).toHaveBeenCalledWith(
         expect.objectContaining({
            where: {
               conversationId: 'c1',
               direction: 'ME',
               createdAt: { gte: at(-2) },
            },
         })
      )
   })
})

describe('words', () => {
   it('should fold every run of white space into one space and trim', () => {
      expect(words('  a \n b\t c ')).toBe('a b c')
   })
})
