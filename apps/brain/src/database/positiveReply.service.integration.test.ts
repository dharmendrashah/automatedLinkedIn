import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { type Call } from 'core/aiWriter'

import { CampaignService } from './campaign.service'
import { PositiveReplyService, type ReplyAi } from './positiveReply.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL, with the migration positive_replies.

const db = PrismaService.client

let userId: string
let otherUserId: string
let accountId: string
let campaignId: string
let label: string

const answering =
   (output: unknown): Call =>
   async () => ({
      output,
      model: 'm',
      inputTokens: 100,
      outputTokens: 10,
   })

const aiThat = (call: Call, configured = true): ReplyAi => ({
   configured: () => configured,
   call,
   price: () => ({
      inputMicros: 1_000_000,
      outputMicros: 2_000_000,
   }),
})

// A person of the campaign (by its label) who wrote to the account.
const heard = async (slug: string, words: string[]) => {
   await db.person.create({
      data: {
         userId,
         slug,
         labels: [label],
         lastTouchAt: new Date(),
      },
   })

   const conversation = await db.linkedInConversation.create({
      data: {
         userId,
         accountId,
         linkedInId: randomUUID(),
         title: slug,
         kind: 'DIRECT',
         participants: [],
         contactProfileUrl: `https://www.linkedin.com/in/${slug}/`,
         unread: false,
         complete: true,
      },
   })
   const messages = await Promise.all(
      words.map((text, position) =>
         db.linkedInMessage.create({
            data: {
               conversationId: conversation.id,
               linkedInId: randomUUID(),
               direction: 'THEM',
               senderName: slug,
               whenText: 'now',
               text,
               attachments: [],
               position,
            },
         })
      )
   )

   return {
      conversationId: conversation.id,
      messageIds: messages.map(({ id }) => id),
   }
}

const replyOf = (slug: string) =>
   db.positiveReply.findUnique({
      where: {
         campaignId_slug: {
            campaignId,
            slug,
         },
      },
   })

describe('PositiveReplyService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email: `${randomUUID()}@elitale.com` })).id
      otherUserId = (await UserService.create({ email: `${randomUUID()}@elitale.com` })).id
      accountId = (
         await db.linkedInAccount.create({
            data: {
               userId,
               email: `${randomUUID()}@example.com`,
               secret: 'x',
               secretIv: 'x',
               secretTag: 'x',
               status: 'ACTIVE',
               lastVerifiedAt: new Date(),
            },
         })
      ).id

      const campaign = await CampaignService.create(userId, { name: `Pipeline ${randomUUID().slice(0, 8)}` })

      ;({ id: campaignId, label } = campaign)
   })

   afterAll(async () => {
      await db.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } })
   })

   it('should count a sure yes at once as a rule-detected reply, once however many times it is read', async () => {
      const { conversationId, messageIds } = await heard('ada-yes', ['Sounds good, send me the details.'])

      await PositiveReplyService.ingest(userId, conversationId, messageIds)
      await PositiveReplyService.ingest(userId, conversationId, messageIds)

      expect(await replyOf('ada-yes')).toMatchObject({
         state: 'COUNTED',
         source: 'RULES',
      })
      expect(
         await db.positiveReply.count({
            where: {
               campaignId,
               slug: 'ada-yes',
            },
         })
      ).toBe(1)
      expect(
         await db.positiveReplyCheck.count({
            where: {
               campaignId,
               slug: 'ada-yes',
            },
         })
      ).toBe(0)
   })

   it('should count nothing for a no, and queue no check for it', async () => {
      const { conversationId, messageIds } = await heard('grace-no', ['Not interested, thanks.'])

      await PositiveReplyService.ingest(userId, conversationId, messageIds)

      expect(await replyOf('grace-no')).toBeNull()
      expect(
         await db.positiveReplyCheck.count({
            where: {
               campaignId,
               slug: 'grace-no',
            },
         })
      ).toBe(0)
   })

   it('should queue an unclear reply, count it only when the AI is sure it is positive, and pay once', async () => {
      const { conversationId, messageIds } = await heard('alan-price', ['What does it cost?'])

      await PositiveReplyService.ingest(userId, conversationId, messageIds)
      expect(await replyOf('alan-price')).toBeNull()
      expect(
         await db.positiveReplyCheck.count({
            where: {
               campaignId,
               slug: 'alan-price',
               state: 'WAITING',
            },
         })
      ).toBe(1)

      // AI not set up: it waits, nothing is counted, nothing is paid.
      const off = vi.fn<Call>()

      await PositiveReplyService.checkWaiting({ ai: aiThat(off, false) })
      expect(off).not.toHaveBeenCalled()
      expect(
         await db.positiveReplyCheck.count({
            where: {
               campaignId,
               slug: 'alan-price',
               state: 'WAITING',
            },
         })
      ).toBe(1)

      const call = vi.fn<Call>(
         answering({
            label: 'positive',
            confidence: 88,
         })
      )
      const first = await PositiveReplyService.checkWaiting({ ai: aiThat(call) })

      expect(first.counted).toBeGreaterThanOrEqual(1)
      expect(await replyOf('alan-price')).toMatchObject({
         state: 'COUNTED',
         source: 'AI',
      })
      expect(call).toHaveBeenCalledTimes(1)

      // A repeated pass finds nothing waiting: no second call, no second payment.
      await PositiveReplyService.checkWaiting({ ai: aiThat(call) })
      expect(call).toHaveBeenCalledTimes(1)
      expect(
         await db.spendLedger.count({
            where: {
               userId,
               label: 'AI replies',
            },
         })
      ).toBe(1)
   })

   it('should not count a reply the AI is not sure about, and should give up on a model that keeps failing', async () => {
      const unsure = await heard('mary-hm', ['hm'])

      await PositiveReplyService.ingest(userId, unsure.conversationId, unsure.messageIds)
      await PositiveReplyService.checkWaiting({
         ai: aiThat(
            answering({
               label: 'positive',
               confidence: 60,
            })
         ),
      })
      expect(await replyOf('mary-hm')).toBeNull()

      const broken = await heard('jo-down', ['thanks?'])
      const failing = vi.fn<Call>(async () => {
         throw new Error('down')
      })

      await PositiveReplyService.ingest(userId, broken.conversationId, broken.messageIds)

      for (let pass = 0; pass < 3; pass += 1) {
         await PositiveReplyService.checkWaiting({ ai: aiThat(failing) })
      }

      expect(await replyOf('jo-down')).toBeNull()
      expect(
         await db.positiveReplyCheck.findFirst({
            where: {
               campaignId,
               slug: 'jo-down',
            },
         })
      ).toMatchObject({ state: 'SKIPPED' })
   })

   it('should never count again a person the owner removed, and let the owner bring them back', async () => {
      const { conversationId, messageIds } = await heard('ken-removed', ['I am interested!'])

      await PositiveReplyService.ingest(userId, conversationId, messageIds)
      expect(await replyOf('ken-removed')).toMatchObject({ state: 'COUNTED' })

      await expect(PositiveReplyService.unmark(userId, conversationId, campaignId)).resolves.toBe(true)
      expect(await replyOf('ken-removed')).toMatchObject({ state: 'REMOVED' })

      await PositiveReplyService.ingest(userId, conversationId, messageIds)
      expect(await replyOf('ken-removed')).toMatchObject({ state: 'REMOVED' })

      await expect(PositiveReplyService.mark(userId, conversationId, campaignId)).resolves.toBe(true)
      expect(await replyOf('ken-removed')).toMatchObject({
         state: 'COUNTED',
         source: 'MARKED',
      })
   })

   it('should keep every call to the owner: a foreign conversation or campaign is not found', async () => {
      const { conversationId } = await heard('eve-private', ['Let us talk'])

      expect(await PositiveReplyService.forConversation(otherUserId, conversationId)).toBeNull()
      await expect(PositiveReplyService.mark(otherUserId, conversationId, campaignId)).resolves.toBe(false)
      await expect(PositiveReplyService.setReplyValue(otherUserId, campaignId, 100)).resolves.toBe(false)
      expect(await PositiveReplyService.forConversation(userId, conversationId)).toMatchObject({
         canMark: true,
         suggestedCampaignId: campaignId,
      })
   })

   it('should make the pipeline replies x (monthly worth x 12), and none until a worth is set', async () => {
      const other = await CampaignService.create(userId, { name: `Worth ${randomUUID().slice(0, 8)}` })

      await db.positiveReply.createMany({
         data: Array.from({ length: 10 }, (_, at) => ({
            userId,
            campaignId: other.id,
            slug: `person-${at}`,
            source: 'MARKED' as const,
         })),
      })

      const before = (await PositiveReplyService.pipeline(userId)).campaigns.find(({ id }) => id === other.id)

      expect(before).toMatchObject({
         replies: 10,
         marked: 10,
         pipelineUsd: null,
      })

      await PositiveReplyService.setReplyValue(userId, other.id, 100)

      const after = await PositiveReplyService.pipeline(userId)

      expect(after.campaigns.find(({ id }) => id === other.id)).toMatchObject({
         replies: 10,
         pipelineUsd: 12_000,
      })
      expect(after.totalUsd).toBe(12_000)
   })

   it('should read existing conversations once: count the sure ones, queue the unclear, and add nothing on a second press', async () => {
      const fresh = await UserService.create({ email: `${randomUUID()}@elitale.com` })
      const campaign = await CampaignService.create(fresh.id, { name: `Backfill ${randomUUID().slice(0, 8)}` })
      const account = await db.linkedInAccount.create({
         data: {
            userId: fresh.id,
            email: `${randomUUID()}@example.com`,
            secret: 'x',
            secretIv: 'x',
            secretTag: 'x',
            status: 'ACTIVE',
            lastVerifiedAt: new Date(),
         },
      })
      const talk = async (slug: string, text: string, labels: string[]) => {
         await db.person.create({
            data: {
               userId: fresh.id,
               slug,
               labels,
               lastTouchAt: new Date(),
            },
         })

         const conversation = await db.linkedInConversation.create({
            data: {
               userId: fresh.id,
               accountId: account.id,
               linkedInId: randomUUID(),
               title: slug,
               kind: 'DIRECT',
               participants: [],
               contactProfileUrl: `https://www.linkedin.com/in/${slug}/`,
               unread: false,
               complete: true,
            },
         })

         await db.linkedInMessage.create({
            data: {
               conversationId: conversation.id,
               linkedInId: randomUUID(),
               direction: 'THEM',
               senderName: slug,
               whenText: 'now',
               text,
               attachments: [],
               position: 0,
            },
         })
      }

      await talk('yes-one', 'Love to talk, book a call', [campaign.label])
      await talk('unclear-one', 'What does it cost?', [campaign.label])
      await talk('no-campaign', 'Sounds great', [])

      const first = await PositiveReplyService.backfill(fresh.id)

      expect(first).toMatchObject({
         counted: 1,
         queued: 1,
         noCampaign: 1,
         aiOff: false,
      })

      const second = await PositiveReplyService.backfill(fresh.id)

      expect(second).toMatchObject({
         counted: 0,
         queued: 0,
         alreadyKnown: 1,
      })

      await PositiveReplyService.setAiReads(fresh.id, false)
      await talk('unclear-two', 'How much?', [campaign.label])
      await expect(PositiveReplyService.backfill(fresh.id)).resolves.toMatchObject({
         queued: 0,
         aiOff: true,
      })

      await db.user.delete({ where: { id: fresh.id } })
   })
})
