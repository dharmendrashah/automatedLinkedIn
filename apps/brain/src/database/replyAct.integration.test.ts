import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { PrismaService } from './prisma.service'
import { ReplyActService } from './replyAct.service'
import { UserService } from './user.service'

// Needs PostgreSQL. What "Send message" and "Reply in a conversation" find: connections, conversations, lately written to and where a
// message stands, for the owner's accounts only.

const db = PrismaService.client
const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`

let userId: string
let otherUserId: string
let first: string
let second: string
let theirs: string
let conversationId: string
let theirConversationId: string

const account = async (owner: string) =>
   (
      await db.linkedInAccount.create({
         data: {
            userId: owner,
            email: `${randomUUID()}@example.com`,
            secret: 'x',
            secretIv: 'x',
            secretTag: 'x',
            status: 'ACTIVE',
         },
         select: { id: true },
      })
   ).id

const conversation = async (owner: string, forAccount: string, title: string, direction: 'ME' | 'THEM') =>
   (
      await db.linkedInConversation.create({
         data: {
            userId: owner,
            accountId: forAccount,
            linkedInId: randomUUID(),
            title,
            kind: 'DIRECT',
            participants: [],
            unread: false,
            complete: true,
            lastDirection: direction,
         },
         select: { id: true },
      })
   ).id

describe('ReplyActService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherUserId = (await UserService.create({ email: otherEmail })).id
      first = await account(userId)
      second = await account(userId)
      theirs = await account(otherUserId)

      for (const [owner, forAccount, slug, status] of [
         [userId, first, 'ada', 'CONNECTED'],
         [userId, second, 'ada', 'CONNECTED'],
         [userId, second, 'bob', 'CONNECTED'],
         [userId, first, 'gone', 'REMOVED'],
         [otherUserId, theirs, 'eve', 'CONNECTED'],
      ] as const) {
         await db.linkedInConnection.create({
            data: {
               userId: owner,
               accountId: forAccount,
               slug,
               name: slug.toUpperCase(),
               headline: '',
               status,
            },
         })
      }

      conversationId = await conversation(userId, first, 'Ada', 'THEM')
      theirConversationId = await conversation(otherUserId, theirs, 'Eve', 'THEM')

      await db.person.create({
         data: {
            userId,
            slug: 'ada',
            name: 'Ada',
            company: 'Analytical Engines',
            lastTouchAt: new Date(),
         },
      })
   })

   afterAll(async () => {
      await db.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should give each person the first of the chosen accounts they are connected to, and none who is removed or another owner’s', async () => {
      const via = await ReplyActService.connectedVia(userId, [second, first], ['ada', 'bob', 'gone', 'eve'])

      expect(via).toEqual(
         new Map([
            ['ada', second],
            ['bob', second],
         ])
      )
      expect((await ReplyActService.connectedVia(userId, [first], ['ada'])).get('ada')).toBe(first)
      expect(await ReplyActService.connectedVia(userId, [theirs], ['eve'])).toEqual(new Map())
   })

   it('should give the conversations that are the owner’s, with their account and who wrote last', async () => {
      const rows = await ReplyActService.conversations(userId, [conversationId, theirConversationId])

      expect(rows).toEqual([
         {
            id: conversationId,
            accountId: first,
            lastDirection: 'THEM',
         },
      ])
   })

   it('should know the company My network has for a person', async () => {
      expect(await ReplyActService.companies(userId, ['ada', 'bob'])).toEqual(new Map([['ada', 'Analytical Engines']]))
      expect(await ReplyActService.companies(otherUserId, ['ada'])).toEqual(new Map())
   })

   it('should say where a message went lately, by conversation and by account and person, and where it stands', async () => {
      const sent = await db.linkedInReply.create({
         data: {
            userId,
            accountId: first,
            conversationId,
            text: 'Hi',
            state: 'SENT',
         },
         select: { id: true },
      })
      const firstMessage = await db.linkedInReply.create({
         data: {
            userId,
            accountId: second,
            recipientSlug: 'bob',
            text: 'Hello',
            state: 'QUEUED',
         },
         select: { id: true },
      })
      const failed = await db.linkedInReply.create({
         data: {
            userId,
            accountId: second,
            recipientSlug: 'ada',
            text: 'Hello',
            state: 'FAILED',
            failure: 'It could not start in time. Nothing was sent.',
         },
         select: { id: true },
      })
      const recent = await ReplyActService.recent(userId, 24, {
         conversationIds: [conversationId],
         accountIds: [first, second],
         slugs: ['ada', 'bob'],
      })

      expect(recent).toEqual(new Set([conversationId, `${second}:bob`]))

      const standing = await ReplyActService.standing(userId, [sent.id, firstMessage.id, failed.id])

      expect(standing.get(sent.id)).toEqual({
         status: 'DONE',
         reason: null,
      })
      expect(standing.get(firstMessage.id)?.status).toBe('WAITING')
      expect(standing.get(failed.id)).toEqual({
         status: 'FAILED',
         reason: 'It could not start in time. Nothing was sent.',
      })
      expect(await ReplyActService.standing(otherUserId, [sent.id])).toEqual(new Map())
   })
})
