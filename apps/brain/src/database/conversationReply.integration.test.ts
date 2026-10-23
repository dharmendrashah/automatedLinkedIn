import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { latestReplies } from './conversationReply'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL.

const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`
const HOUR = 60 * 60 * 1000

let userId: string
let otherUserId: string
let accountId: string
let otherAccountId: string

const account = (id: string) =>
   PrismaService.client.linkedInAccount.create({
      data: {
         userId: id,
         email: `${randomUUID()}@example.com`,
         secret: 'x',
         secretIv: 'x',
         secretTag: 'x',
      },
   })

const conversation = (id: string, forAccountId: string) =>
   PrismaService.client.linkedInConversation.create({
      data: {
         userId: id,
         accountId: forAccountId,
         linkedInId: randomUUID(),
         title: 'Ada',
         kind: 'DIRECT',
         participants: [],
         unread: false,
         complete: false,
      },
   })

type Extra = {
   failure?: string
   dismissedAt?: Date
   attachments?: object[]
}

const reply = (
   conversationId: string,
   state: 'SENDING' | 'SENT' | 'FAILED' | 'UNKNOWN',
   hoursAgo: number,
   extra: Extra = {}
) =>
   PrismaService.client.linkedInReply.create({
      data: {
         userId,
         accountId,
         conversationId,
         text: `${state} ${hoursAgo}`,
         state,
         sessionId: randomUUID(),
         createdAt: new Date(Date.now() - hoursAgo * HOUR),
         ...extra,
      },
   })

describe('latestReplies (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherUserId = (await UserService.create({ email: otherEmail })).id
      accountId = (await account(userId)).id
      otherAccountId = (await account(otherUserId)).id
   })

   // Only one reply may be sending from an account, so each test begins with none.
   beforeEach(async () => {
      await PrismaService.client.linkedInReply.deleteMany({ where: { userId } })
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should say a reply is being sent, with its words, its files and when it began', async () => {
      const { id } = await conversation(userId, accountId)
      const sending = await reply(id, 'SENDING', 0.1, {
         attachments: [
            {
               name: 'cv.pdf',
               kind: 'FILE',
               bytes: 9,
            },
         ],
      })

      expect((await latestReplies(userId)).get(id)).toEqual({
         id: sending.id,
         state: 'SENDING',
         text: 'SENDING 0.1',
         files: [
            {
               name: 'cv.pdf',
               kind: 'FILE',
               bytes: 9,
            },
         ],
         startedAt: sending.createdAt,
         failure: null,
      })
   })

   it('should say a reply did not go, or may not have, with its sentence, until the owner dismisses it', async () => {
      const failedAt = await conversation(userId, accountId)
      const unsure = await conversation(userId, accountId)
      const failed = await reply(failedAt.id, 'FAILED', 2, { failure: 'LinkedIn did not send the reply.' })

      await reply(unsure.id, 'UNKNOWN', 3, { failure: 'LinkedIn did not show whether the reply was sent.' })

      const replies = await latestReplies(userId)

      expect(replies.get(failedAt.id)).toMatchObject({
         id: failed.id,
         state: 'FAILED',
         failure: 'LinkedIn did not send the reply.',
      })
      expect(replies.get(unsure.id)).toMatchObject({ state: 'UNKNOWN' })

      await PrismaService.client.linkedInReply.update({
         where: { id: failed.id },
         data: { dismissedAt: new Date() },
      })

      expect((await latestReplies(userId)).has(failedAt.id)).toBe(false)
      expect((await latestReplies(userId)).has(unsure.id)).toBe(true)
   })

   it('should say nothing of a reply that went, one older than a day, or a failure followed by a newer reply', async () => {
      const sent = await conversation(userId, accountId)
      const old = await conversation(userId, accountId)
      const retried = await conversation(userId, accountId)

      await reply(sent.id, 'SENT', 1)
      await reply(old.id, 'FAILED', 30)
      await reply(retried.id, 'FAILED', 5)
      await reply(retried.id, 'SENT', 4)

      const replies = await latestReplies(userId)

      expect(replies.has(sent.id)).toBe(false)
      expect(replies.has(old.id)).toBe(false)
      expect(replies.has(retried.id)).toBe(false)
   })

   it('should say only the newest reply of a conversation', async () => {
      const { id } = await conversation(userId, accountId)

      await reply(id, 'FAILED', 6)

      const newest = await reply(id, 'SENDING', 0.2)

      expect((await latestReplies(userId)).get(id)).toMatchObject({
         id: newest.id,
         state: 'SENDING',
      })
   })

   it('should say nothing of the replies of someone else', async () => {
      const mine = await conversation(userId, accountId)
      const theirs = await conversation(otherUserId, otherAccountId)

      await PrismaService.client.linkedInReply.create({
         data: {
            userId: otherUserId,
            accountId: otherAccountId,
            conversationId: theirs.id,
            text: 'x',
            state: 'SENDING',
            sessionId: randomUUID(),
         },
      })

      const replies = await latestReplies(userId)

      expect(replies.has(theirs.id)).toBe(false)
      expect(replies.has(mine.id)).toBe(false)
   })
})
