import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ClientService } from './client.service'
import { ConversationReadService } from './conversationRead.service'
import { InvitationAnswerService } from './invitationAnswer.service'
import { InvitationReadService } from './invitationRead.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL. What "Get my connection requests" and "Get my conversations" read: the stored rows of the owner's accounts only.

const db = PrismaService.client
const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`
const SINCE = new Date('2026-11-02T10:00:00Z')

let userId: string
let accountId: string
let otherUserId: string
let otherAccountId: string

const account = async (owner: string, name: string) =>
   (
      await db.linkedInAccount.create({
         data: {
            userId: owner,
            email: `${randomUUID()}@example.com`,
            secret: 'x',
            secretIv: 'x',
            secretTag: 'x',
            status: 'ACTIVE',
            clientId: (await ClientService.create(owner, name)).id,
         },
         select: { id: true },
      })
   ).id

describe('the stored requests and conversations of an account (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherUserId = (await UserService.create({ email: otherEmail })).id
      accountId = await account(userId, 'Acme')
      otherAccountId = await account(otherUserId, 'Theirs')

      for (const [owner, forAccount, slug, position, status, note] of [
         [userId, accountId, 'ana', 0, 'PENDING', 'x'.repeat(400)],
         [userId, accountId, 'ravi', 1, 'PENDING', null],
         [userId, accountId, 'done', 2, 'ACCEPTED', null],
         [otherUserId, otherAccountId, 'stranger', 0, 'PENDING', null],
      ] as const) {
         await db.linkedInInvitation.create({
            data: {
               userId: owner,
               accountId: forAccount,
               linkedInId: randomUUID(),
               slug,
               name: slug.toUpperCase(),
               headline: 'Founder',
               position,
               status,
               note,
            },
         })
      }

      for (const [owner, forAccount, linkedInId, title, direction, text, at] of [
         [userId, accountId, 't-new', 'Ada', 'THEM', 'W'.repeat(300), '2026-11-02T09:00:00Z'],
         [userId, accountId, 't-old', 'Bob', 'ME', 'See you then', '2026-10-01T09:00:00Z'],
         [otherUserId, otherAccountId, 't-theirs', 'Eve', 'THEM', 'Hello', '2026-11-02T09:30:00Z'],
      ] as const) {
         const conversation = await db.linkedInConversation.create({
            data: {
               userId: owner,
               accountId: forAccount,
               linkedInId,
               title,
               kind: 'DIRECT',
               participants: [
                  {
                     name: title,
                     profileUrl: `https://www.linkedin.com/in/${title.toLowerCase()}/`,
                  },
               ],
               contactProfileUrl: `https://www.linkedin.com/in/${title.toLowerCase()}/`,
               unread: direction === 'THEM',
               complete: true,
               messageCount: 1,
               lastMessageAt: new Date(at),
               lastDirection: direction,
            },
         })

         await db.linkedInMessage.create({
            data: {
               conversationId: conversation.id,
               linkedInId: `${linkedInId}-1`,
               direction,
               senderName: title,
               sentAt: new Date(at),
               whenText: 'Today',
               text,
               attachments: [],
               position: 1,
            },
         })
      }
   })

   afterAll(async () => {
      await db.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should give the requests that still wait, in order, with the note cut, and none of another owner', async () => {
      const people = await InvitationReadService.people(userId, [accountId, otherAccountId], 10)

      expect(people.map(({ slug }) => slug)).toEqual(['ana', 'ravi'])
      expect(people[0]?.note).toHaveLength(300)
      expect(people[1]?.note).toBeNull()
      expect(people[0]?.url).toBe('https://www.linkedin.com/in/ana/')
   })

   it('should give the newest conversations with the last words cut, who wrote last and the person, and none of another owner', async () => {
      const conversations = await ConversationReadService.conversations(userId, [accountId, otherAccountId], 10)

      expect(conversations.map(({ name }) => name)).toEqual(['Ada', 'Bob'])
      expect(conversations[0]).toMatchObject({
         personSlug: 'ada',
         lastFrom: 'THEM',
         unread: true,
         url: 'https://www.linkedin.com/messaging/thread/t-new/',
      })
      expect(conversations[0]?.lastText).toHaveLength(200)
      expect(conversations[1]).toMatchObject({
         lastFrom: 'ME',
         lastText: 'See you then',
      })
      expect(await ConversationReadService.conversations(userId, [accountId], 1)).toHaveLength(1)
   })

   it('should find the requests that still wait in the chosen accounts, and say where each stands', async () => {
      const pending = await InvitationAnswerService.pending(userId, [accountId], ['ana', 'ravi', 'done', 'stranger'])

      expect(pending.map(({ slug }) => slug)).toEqual(['ana', 'ravi'])
      expect(await InvitationAnswerService.pending(userId, [otherAccountId], ['stranger'])).toEqual([])

      const done = await db.linkedInInvitation.findFirstOrThrow({
         where: {
            userId,
            slug: 'done',
         },
         select: { id: true },
      })
      const failed = await db.linkedInInvitation.create({
         data: {
            userId,
            accountId,
            linkedInId: randomUUID(),
            slug: 'failed',
            name: 'FAILED',
            headline: '',
            status: 'FAILED',
            failure: 'It could not start in time.',
         },
         select: { id: true },
      })
      const standing = await InvitationAnswerService.standing(userId, [
         done.id,
         failed.id,
         pending[0]?.id ?? '',
         randomUUID(),
      ])

      expect(standing.get(done.id)).toEqual({
         status: 'DONE',
         reason: null,
      })
      expect(standing.get(failed.id)).toEqual({
         status: 'FAILED',
         reason: 'It could not start in time.',
      })
      expect(standing.get(pending[0]?.id ?? '')?.status).toBe('WAITING')
      expect(standing.size).toBe(3)
      expect(await InvitationAnswerService.standing(otherUserId, [done.id])).toEqual(new Map())
   })

   it('should say running until a newer read ended and was stored, for requests and for messages', async () => {
      expect(await InvitationReadService.state(accountId, SINCE)).toBe('RUNNING')
      expect(await ConversationReadService.state(accountId, SINCE)).toBe('RUNNING')

      for (const [task, table] of [
         ['linkedin-invitations', 'invitationImport'],
         ['linkedin-messages', 'messageImport'],
      ] as const) {
         const id = randomUUID()

         await db.spiderSession.create({
            data: {
               id,
               userId,
               linkedInAccountId: accountId,
               kind: 'TASK',
               task,
               status: 'SUCCEEDED',
               startedAt: new Date('2026-11-02T10:05:00Z'),
               finishedAt: new Date('2026-11-02T10:06:00Z'),
               requestParams: {},
            },
         })

         if (table === 'invitationImport') {
            await db.invitationImport.create({ data: { sessionId: id } })
         } else {
            await db.messageImport.create({
               data: {
                  sessionId: id,
                  status: 'DONE',
               },
            })
         }
      }

      expect(await InvitationReadService.state(accountId, SINCE)).toBe('RUNNING')
      expect(await ConversationReadService.state(accountId, SINCE)).toBe('DONE')

      await db.invitationImport.updateMany({
         where: { session: { linkedInAccountId: accountId } },
         data: { status: 'DONE' },
      })
      expect(await InvitationReadService.state(accountId, SINCE)).toBe('DONE')
   })
})
