import { aiConfigured, aiPrice, callModel } from 'core/aiModel'
import { readReply } from 'core/aiReplyReader'
import { type Call, type Price } from 'core/aiWriter'

import {
   BACKFILL_AI_CALLS,
   CHECK_MAX_AGE_DAYS,
   MAX_CHECK_ATTEMPTS,
   type PositiveReplySource,
   pipelineOf,
   replyLeanOf,
} from '@automatedLinkedIn/contracts'

import { AiBudgetService } from './aiBudget.service'
import { campaignOfReply, slugOfProfileUrl } from './positiveReplyRules'
import { PrismaService } from './prisma.service'

// Positive replies and the revenue pipeline they make (.plan/campaign-revenue-pipeline.md). One row per person and campaign. The word rules
// decide when they are sure; the AI is asked, in a worker job, only about a reply the rules were not sure about. No message text is kept.
// Every call is scoped to the owner.

const DAY_MS = 24 * 60 * 60 * 1000
const AI_LABEL = 'AI replies'
const PAGE = 200

export const CHECK_SENTENCES = {
   counted: 'Counted as a positive reply.',
   notPositive: 'The AI did not find interest. Nothing was counted.',
   known: 'This person is already counted or removed for the campaign.',
   gone: 'The message is no longer stored. Nothing was counted.',
   off: 'AI reading of replies is switched off. Nothing was counted.',
   old: 'It waited too long. Mark it by hand if it was positive.',
   failed: 'The AI could not read it. Mark it by hand if it was positive.',
} as const

export type ReplyAi = {
   configured: () => boolean
   call: Call
   price: () => Price
}

const REAL_AI: ReplyAi = {
   configured: aiConfigured,
   call: callModel,
   price: aiPrice,
}

export type PipelineStats = {
   replies: number
   rules: number
   ai: number
   marked: number
}

export type BackfillResult = {
   counted: number
   queued: number
   alreadyKnown: number
   noCampaign: number
   leftForNextPress: number
   aiOff: boolean
}

export class PositiveReplyService {
   // The campaign a person's reply belongs to, from their newest invite or the one campaign label they carry; null when unclear.
   public static async campaignFor(userId: string, slug: string) {
      const db = PrismaService.client
      const invite = await db.linkedInInvite.findFirst({
         where: {
            userId,
            slug,
            originWorkflowId: { not: null },
         },
         orderBy: { createdAt: 'desc' },
         select: { originWorkflowId: true },
      })
      const workflow = invite?.originWorkflowId
         ? await db.workflow.findFirst({
              where: {
                 id: invite.originWorkflowId,
                 userId,
              },
              select: { campaignId: true },
           })
         : null
      const person = await db.person.findUnique({
         where: {
            userId_slug: {
               userId,
               slug,
            },
         },
         select: { labels: true },
      })
      const labelled = person?.labels.length
         ? await db.campaign.findMany({
              where: {
                 userId,
                 label: { in: person.labels },
              },
              select: { id: true },
           })
         : []

      return campaignOfReply({
         inviteCampaignId: workflow?.campaignId ?? null,
         labelCampaignIds: labelled.map(({ id }) => id),
      })
   }

   private static count(
      userId: string,
      campaignId: string,
      slug: string,
      source: PositiveReplySource,
      conversationId: string | null
   ) {
      return PrismaService.client.positiveReply.createMany({
         data: [
            {
               userId,
               campaignId,
               slug,
               source,
               conversationId,
            },
         ],
         skipDuplicates: true,
      })
   }

   // Called after new messages from a person were stored: the rules read them; a sure yes counts at once, a reply the rules are not sure
   // about waits for the AI. Never throws into the caller's work; a failure here must not break reading messages.
   public static async ingest(userId: string, conversationId: string, messageIds: string[]) {
      if (messageIds.length === 0) {
         return
      }

      const db = PrismaService.client
      const conversation = await db.linkedInConversation.findFirst({
         where: {
            id: conversationId,
            userId,
            kind: 'DIRECT',
         },
         select: { contactProfileUrl: true },
      })
      const slug = slugOfProfileUrl(conversation?.contactProfileUrl)

      if (!slug) {
         return
      }

      const campaignId = await this.campaignFor(userId, slug)

      if (!campaignId) {
         return
      }

      const known = await db.positiveReply.findUnique({
         where: {
            campaignId_slug: {
               campaignId,
               slug,
            },
         },
         select: { id: true },
      })

      if (known) {
         return
      }

      const messages = await db.linkedInMessage.findMany({
         where: {
            id: { in: messageIds },
            conversationId,
            direction: 'THEM',
         },
         orderBy: [{ sentAt: 'asc' }, { position: 'asc' }],
         select: {
            id: true,
            text: true,
         },
      })
      let unsure: string | null = null

      for (const message of messages) {
         const lean = replyLeanOf(message.text)

         if (lean === 'yes') {
            await this.count(userId, campaignId, slug, 'RULES', conversationId)

            return
         }

         if (lean === 'unsure') {
            unsure = message.id
         }
      }

      if (!unsure) {
         return
      }

      const user = await db.user.findUnique({
         where: { id: userId },
         select: { aiReadsReplies: true },
      })
      const waiting = await db.positiveReplyCheck.count({
         where: {
            userId,
            campaignId,
            slug,
            state: 'WAITING',
         },
      })

      if (user?.aiReadsReplies && waiting === 0) {
         await db.positiveReplyCheck.createMany({
            data: [
               {
                  userId,
                  campaignId,
                  messageId: unsure,
                  conversationId,
                  slug,
               },
            ],
            skipDuplicates: true,
         })
      }
   }

   // The checks waiting for the AI, oldest first, each read once. A check that cannot be answered now (AI not set up, the budget spent)
   // stays waiting; one that failed or waited too long ends, and the owner can still mark by hand.
   public static async checkWaiting({ limit = 50, now = new Date(), ai = REAL_AI } = {}) {
      const db = PrismaService.client
      const waiting = await db.positiveReplyCheck.findMany({
         where: { state: 'WAITING' },
         orderBy: { createdAt: 'asc' },
         take: limit,
      })
      const totals = {
         read: 0,
         counted: 0,
         skipped: 0,
         left: 0,
      }
      const end = async (id: string, state: 'DONE' | 'SKIPPED', reason: string, attempts?: number) => {
         const { count } = await db.positiveReplyCheck.updateMany({
            where: {
               id,
               state: 'WAITING',
            },
            data: {
               state,
               reason,
               ...(attempts !== undefined && { attempts }),
            },
         })

         if (count > 0 && state === 'SKIPPED') {
            totals.skipped += 1
         }
      }

      for (const check of waiting) {
         if (now.getTime() - check.createdAt.getTime() > CHECK_MAX_AGE_DAYS * DAY_MS) {
            await end(check.id, 'SKIPPED', CHECK_SENTENCES.old)

            continue
         }

         const user = await db.user.findUnique({
            where: { id: check.userId },
            select: { aiReadsReplies: true },
         })

         if (!user?.aiReadsReplies) {
            await end(check.id, 'SKIPPED', CHECK_SENTENCES.off)

            continue
         }

         const known = await db.positiveReply.findUnique({
            where: {
               campaignId_slug: {
                  campaignId: check.campaignId,
                  slug: check.slug,
               },
            },
            select: { id: true },
         })

         if (known) {
            await end(check.id, 'DONE', CHECK_SENTENCES.known)

            continue
         }

         const message = await db.linkedInMessage.findFirst({
            where: {
               id: check.messageId,
               conversationId: check.conversationId,
            },
            select: { text: true },
         })

         if (!message) {
            await end(check.id, 'SKIPPED', CHECK_SENTENCES.gone)

            continue
         }

         if (!ai.configured() || (await AiBudgetService.room(check.userId, now)) !== 'OK') {
            totals.left += 1

            continue
         }

         const read = await readReply(message.text, ai.call, ai.price())

         if (read.status === 'FAILED') {
            const attempts = check.attempts + 1

            if (attempts >= MAX_CHECK_ATTEMPTS) {
               await end(check.id, 'SKIPPED', CHECK_SENTENCES.failed, attempts)
            } else {
               await db.positiveReplyCheck.updateMany({
                  where: {
                     id: check.id,
                     state: 'WAITING',
                  },
                  data: { attempts },
               })
               totals.left += 1
            }

            continue
         }

         totals.read += 1
         // A billed call is booked even when nothing is counted; the id is the check's, so a repeated pass never pays twice.
         await AiBudgetService.record(
            check.userId,
            {
               id: check.id,
               workflowId: null,
               runId: null,
               amountMicros: read.usage.costMicros,
               label: AI_LABEL,
               preview: false,
            },
            now
         )

         if (read.status === 'POSITIVE') {
            await this.count(check.userId, check.campaignId, check.slug, 'AI', check.conversationId)
            totals.counted += 1
            await end(check.id, 'DONE', CHECK_SENTENCES.counted)
         } else {
            await end(check.id, 'DONE', CHECK_SENTENCES.notPositive)
         }
      }

      return totals
   }

   // What the Unibox shows for a conversation: who it is, the campaign we would count it in, every campaign to pick from, and what is
   // counted already. Null for a conversation that is not the owner's.
   public static async forConversation(userId: string, conversationId: string) {
      const db = PrismaService.client
      const conversation = await db.linkedInConversation.findFirst({
         where: {
            id: conversationId,
            userId,
         },
         select: { contactProfileUrl: true },
      })

      if (!conversation) {
         return null
      }

      const slug = slugOfProfileUrl(conversation.contactProfileUrl)
      const campaigns = await db.campaign.findMany({
         where: { userId },
         orderBy: { createdAt: 'desc' },
         select: {
            id: true,
            name: true,
         },
      })
      const replies = slug
         ? await db.positiveReply.findMany({
              where: {
                 userId,
                 slug,
              },
              select: {
                 campaignId: true,
                 state: true,
                 source: true,
              },
           })
         : []

      return {
         canMark: slug !== null,
         suggestedCampaignId: slug ? await this.campaignFor(userId, slug) : null,
         campaigns,
         replies,
      }
   }

   // The owner counts a person for a campaign by hand; a removed one comes back, and it is theirs from now on.
   public static async mark(userId: string, conversationId: string, campaignId: string) {
      return this.setByHand(userId, conversationId, campaignId, 'COUNTED')
   }

   // The owner takes a person out; the row stays, so no detection counts them again.
   public static async unmark(userId: string, conversationId: string, campaignId: string) {
      return this.setByHand(userId, conversationId, campaignId, 'REMOVED')
   }

   private static async setByHand(
      userId: string,
      conversationId: string,
      campaignId: string,
      state: 'COUNTED' | 'REMOVED'
   ) {
      const db = PrismaService.client
      const [conversation, campaign] = await Promise.all([
         db.linkedInConversation.findFirst({
            where: {
               id: conversationId,
               userId,
            },
            select: { contactProfileUrl: true },
         }),
         db.campaign.findFirst({
            where: {
               id: campaignId,
               userId,
            },
            select: { id: true },
         }),
      ])
      const slug = slugOfProfileUrl(conversation?.contactProfileUrl)

      if (!campaign || !slug) {
         return false
      }

      await db.positiveReply.upsert({
         where: {
            campaignId_slug: {
               campaignId,
               slug,
            },
         },
         create: {
            userId,
            campaignId,
            slug,
            state,
            source: 'MARKED',
            conversationId,
         },
         update: {
            state,
            source: 'MARKED',
            conversationId,
         },
      })

      return true
   }

   // Counted replies per campaign and where they came from. A campaign with none is absent from the map.
   public static async stats(userId: string, campaignIds?: string[]) {
      const rows = await PrismaService.client.positiveReply.groupBy({
         by: ['campaignId', 'source'],
         where: {
            userId,
            state: 'COUNTED',
            ...(campaignIds && { campaignId: { in: campaignIds } }),
         },
         _count: { _all: true },
      })
      const stats = new Map<string, PipelineStats>()

      for (const row of rows) {
         const one = stats.get(row.campaignId) ?? {
            replies: 0,
            rules: 0,
            ai: 0,
            marked: 0,
         }
         const count = row._count._all

         one.replies += count
         one.rules += row.source === 'RULES' ? count : 0
         one.ai += row.source === 'AI' ? count : 0
         one.marked += row.source === 'MARKED' ? count : 0
         stats.set(row.campaignId, one)
      }

      return stats
   }

   // Every campaign of the owner with its positive replies, what one is worth a month, and the pipeline they make in USD a year (null while
   // no worth is set). `totalUsd` adds the campaigns that have a worth.
   public static async pipeline(userId: string) {
      const campaigns = await PrismaService.client.campaign.findMany({
         where: { userId },
         orderBy: { createdAt: 'desc' },
         select: {
            id: true,
            name: true,
            replyValueUsd: true,
         },
      })
      const stats = await this.stats(
         userId,
         campaigns.map(({ id }) => id)
      )
      const rows = campaigns.map(({ id, name, replyValueUsd }) => {
         const found = stats.get(id) ?? {
            replies: 0,
            rules: 0,
            ai: 0,
            marked: 0,
         }

         return {
            id,
            name,
            replyValueUsd,
            ...found,
            pipelineUsd: pipelineOf(found.replies, replyValueUsd),
         }
      })
      const priced = rows.flatMap(({ pipelineUsd }) => pipelineUsd ?? [])

      return {
         campaigns: rows,
         totalUsd: priced.length > 0 ? priced.reduce((sum, one) => sum + one, 0) : null,
      }
   }

   // What one positive reply of the campaign is worth a month; null clears it. False for a campaign that is not the owner's.
   public static async setReplyValue(userId: string, campaignId: string, valueUsd: number | null) {
      const { count } = await PrismaService.client.campaign.updateMany({
         where: {
            id: campaignId,
            userId,
         },
         data: { replyValueUsd: valueUsd },
      })

      return count > 0
   }

   public static async aiReads(userId: string) {
      return (
         (
            await PrismaService.client.user.findUnique({
               where: { id: userId },
               select: { aiReadsReplies: true },
            })
         )?.aiReadsReplies ?? true
      )
   }

   public static async setAiReads(userId: string, on: boolean) {
      await PrismaService.client.user.update({
         where: { id: userId },
         data: { aiReadsReplies: on },
      })
   }

   // The one-time read of the owner's existing conversations: the rules count the sure yes at once, and up to 200 unsure replies are
   // queued for the AI (the rest wait for the next press). Pressing again only adds what is new, so it is safe to repeat.
   public static async backfill(userId: string): Promise<BackfillResult> {
      const db = PrismaService.client
      const result: BackfillResult = {
         counted: 0,
         queued: 0,
         alreadyKnown: 0,
         noCampaign: 0,
         leftForNextPress: 0,
         aiOff: !(await this.aiReads(userId)),
      }
      const campaigns = await db.campaign.findMany({
         where: { userId },
         select: {
            id: true,
            label: true,
         },
      })

      if (campaigns.length === 0) {
         return result
      }

      const campaignOfLabel = new Map(campaigns.map(({ id, label }) => [label, id]))
      const workflowCampaign = new Map(
         (
            await db.workflow.findMany({
               where: {
                  userId,
                  campaignId: { not: null },
               },
               select: {
                  id: true,
                  campaignId: true,
               },
            })
         ).map(({ id, campaignId }) => [id, campaignId])
      )
      // The newest invite of each person decides, as for a new reply.
      const inviteCampaign = new Map<string, string | null>()

      for (const { slug, originWorkflowId } of await db.linkedInInvite.findMany({
         where: {
            userId,
            originWorkflowId: { not: null },
         },
         orderBy: { createdAt: 'desc' },
         select: {
            slug: true,
            originWorkflowId: true,
         },
      })) {
         if (!inviteCampaign.has(slug)) {
            inviteCampaign.set(slug, workflowCampaign.get(originWorkflowId ?? '') ?? null)
         }
      }

      const labels = new Map(
         (
            await db.person.findMany({
               where: {
                  userId,
                  NOT: { labels: { isEmpty: true } },
               },
               select: {
                  slug: true,
                  labels: true,
               },
            })
         ).map(({ slug, labels: held }) => [slug, held.flatMap(label => campaignOfLabel.get(label) ?? [])])
      )
      const decided = new Set(
         (
            await db.positiveReply.findMany({
               where: { userId },
               select: {
                  campaignId: true,
                  slug: true,
               },
            })
         ).map(({ campaignId, slug }) => `${campaignId}|${slug}`)
      )
      const waiting = new Set(
         (
            await db.positiveReplyCheck.findMany({
               where: {
                  userId,
                  state: 'WAITING',
               },
               select: {
                  campaignId: true,
                  slug: true,
               },
            })
         ).map(({ campaignId, slug }) => `${campaignId}|${slug}`)
      )
      let cursor: string | undefined

      for (;;) {
         const page = await db.linkedInConversation.findMany({
            where: {
               userId,
               kind: 'DIRECT',
               contactProfileUrl: { not: null },
               messages: { some: { direction: 'THEM' } },
            },
            orderBy: { id: 'asc' },
            take: PAGE,
            ...(cursor && {
               cursor: { id: cursor },
               skip: 1,
            }),
            select: {
               id: true,
               contactProfileUrl: true,
               messages: {
                  where: { direction: 'THEM' },
                  orderBy: [{ sentAt: 'asc' }, { position: 'asc' }],
                  select: {
                     id: true,
                     text: true,
                  },
               },
            },
         })

         for (const conversation of page) {
            const slug = slugOfProfileUrl(conversation.contactProfileUrl)

            if (!slug) {
               continue
            }

            const campaignId = campaignOfReply({
               inviteCampaignId: inviteCampaign.get(slug) ?? null,
               labelCampaignIds: labels.get(slug) ?? [],
            })

            if (!campaignId) {
               result.noCampaign += 1

               continue
            }

            const key = `${campaignId}|${slug}`

            if (decided.has(key)) {
               result.alreadyKnown += 1

               continue
            }

            let unsure: string | null = null
            let yes = false

            for (const message of conversation.messages) {
               const lean = replyLeanOf(message.text)

               if (lean === 'yes') {
                  yes = true

                  break
               }

               if (lean === 'unsure') {
                  unsure = message.id
               }
            }

            if (yes) {
               const { count } = await this.count(userId, campaignId, slug, 'RULES', conversation.id)

               result.counted += count
               decided.add(key)
            } else if (unsure && !result.aiOff && !waiting.has(key)) {
               if (result.queued >= BACKFILL_AI_CALLS) {
                  result.leftForNextPress += 1
               } else {
                  const { count } = await db.positiveReplyCheck.createMany({
                     data: [
                        {
                           userId,
                           campaignId,
                           messageId: unsure,
                           conversationId: conversation.id,
                           slug,
                        },
                     ],
                     skipDuplicates: true,
                  })

                  result.queued += count
                  waiting.add(key)
               }
            }
         }

         if (page.length < PAGE) {
            break
         }

         cursor = page.at(-1)?.id
      }

      return result
   }
}
