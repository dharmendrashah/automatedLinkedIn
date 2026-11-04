import { Prisma } from 'generated/prisma/client'

import { DRAFT_LIMITS, type DraftKind, checkWords } from '@automatedLinkedIn/contracts'

import { isUniqueViolation } from './conflict'
import { PrismaService } from './prisma.service'

// The inbox of words that wait for the owner (.plan/lead-pipeline-p4-ai-drafts.md). It only decides: approving marks a draft APPROVED,
// and the job `approval-start` starts the workflow's "When I approve" with it. Every call is scoped to the owner.

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const RECENT = 20

export const DRAFT_REASONS = {
   ACCEPTED: 'They accepted.',
   NOT_STARTED: 'No workflow started it in time. Nothing was sent.',
} as const

// What the card shows: nothing here is more than the owner already sees in the post.
export type DraftCard = {
   postUrl: string
   excerpt: string | null
   authorName: string | null
   authorHeadline: string | null
}

export type DraftOrigin = { workflowId: string; runId: string; nodeId: string }

export type DraftInput = {
   slug: string
   targetKey: string
   item: Prisma.InputJsonValue
   card: DraftCard
   words: string
   mode: 'TEXTS' | 'AI'
   maxChars: number
   voiceId?: string | null
   model?: string | null
   inputTokens?: number
   outputTokens?: number
   costMicros?: number
}

export type QueueOutcome = 'QUEUED' | 'WAITING' | 'OVER_DAY' | 'TOO_MANY'

export type QueueLimits = { perDay: number; keepWaiting: number; expireHours: number }

const readCard = (value: unknown): DraftCard | null => {
   const card = value as Partial<DraftCard> | null

   return card && typeof card.postUrl === 'string'
      ? {
           postUrl: card.postUrl,
           excerpt: card.excerpt ?? null,
           authorName: card.authorName ?? null,
           authorHeadline: card.authorHeadline ?? null,
        }
      : null
}

export class DraftService {
   // Puts drafts in the inbox, up to the block's limits for the day and for how many wait. Answers by `targetKey`.
   public static async queue(
      userId: string,
      origin: DraftOrigin,
      limits: QueueLimits,
      kind: DraftKind,
      drafts: DraftInput[],
      now = new Date(),
      dryRun = false
   ): Promise<Map<string, QueueOutcome>> {
      const db = PrismaService.client
      const where = {
         userId,
         originWorkflowId: origin.workflowId,
         originNodeId: origin.nodeId,
      }
      let [today, waiting] = await Promise.all([
         db.draft.count({
            where: {
               ...where,
               draftedAt: { gte: new Date(now.getTime() - DAY_MS) },
            },
         }),
         db.draft.count({
            where: {
               ...where,
               state: 'DRAFTED',
            },
         }),
      ])
      const out = new Map<string, QueueOutcome>()

      for (const draft of drafts) {
         if (today >= limits.perDay) {
            out.set(draft.targetKey, 'OVER_DAY')
         } else if (waiting >= limits.keepWaiting) {
            out.set(draft.targetKey, 'TOO_MANY')
         } else if (dryRun) {
            today += 1
            waiting += 1
            out.set(draft.targetKey, 'QUEUED')
         } else {
            try {
               await db.draft.create({
                  data: {
                     userId,
                     kind,
                     mode: draft.mode,
                     slug: draft.slug,
                     targetKey: draft.targetKey,
                     item: draft.item,
                     card: draft.card,
                     words: draft.words,
                     originalWords: draft.words,
                     maxChars: draft.maxChars,
                     expiresAt: new Date(now.getTime() + limits.expireHours * HOUR_MS),
                     originWorkflowId: origin.workflowId,
                     originRunId: origin.runId,
                     originNodeId: origin.nodeId,
                     voiceId: draft.voiceId ?? null,
                     model: draft.model ?? null,
                     inputTokens: draft.inputTokens ?? 0,
                     outputTokens: draft.outputTokens ?? 0,
                     costMicros: draft.costMicros ?? 0,
                  },
               })
               today += 1
               waiting += 1
               out.set(draft.targetKey, 'QUEUED')
            } catch (error) {
               if (!isUniqueViolation(error)) {
                  throw error
               }

               out.set(draft.targetKey, 'WAITING')
            }
         }
      }

      return out
   }

   // The inbox, newest first, by the state the owner is looking at.
   public static async list(
      userId: string,
      filter: {
         state: 'DRAFTED' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED'
         kind?: DraftKind
         cursor?: string
         take: number
      }
   ) {
      const rows = await PrismaService.client.draft.findMany({
         where: {
            userId,
            state: filter.state,
            ...(filter.kind && { kind: filter.kind }),
         },
         orderBy: [{ draftedAt: 'desc' }, { id: 'desc' }],
         take: filter.take + 1,
         ...(filter.cursor && {
            cursor: { id: filter.cursor },
            skip: 1,
         }),
         select: {
            id: true,
            kind: true,
            mode: true,
            slug: true,
            words: true,
            originalWords: true,
            maxChars: true,
            state: true,
            reason: true,
            rejectReason: true,
            expiresAt: true,
            draftedAt: true,
            decidedAt: true,
            startedRunId: true,
            costMicros: true,
            card: true,
         },
      })
      const page = rows.slice(0, filter.take)

      return {
         items: page.map(({ card, ...row }) => ({
            ...row,
            card: readCard(card),
         })),
         next: rows.length > filter.take ? (page.at(-1)?.id ?? null) : null,
      }
   }

   // The badge, and how the owner has been deciding over the last 30 days.
   public static async counts(userId: string, now = new Date()) {
      const db = PrismaService.client
      const since = new Date(now.getTime() - DRAFT_LIMITS.retentionDays * DAY_MS)
      const [waiting, decided, edited, cost] = await Promise.all([
         db.draft.count({
            where: {
               userId,
               state: 'DRAFTED',
               expiresAt: { gt: now },
            },
         }),
         db.draft.groupBy({
            by: ['state'],
            where: {
               userId,
               decidedAt: { gte: since },
            },
            _count: true,
         }),
         db.$queryRaw<Array<{ count: bigint }>>`
            SELECT count(*) AS "count" FROM "Draft"
            WHERE "userId" = ${userId} AND "state" = 'APPROVED' AND "decidedAt" >= ${since}
              AND "words" IS NOT NULL AND "originalWords" IS NOT NULL AND "words" <> "originalWords"`,
         db.draft.aggregate({
            where: {
               userId,
               draftedAt: { gte: since },
               mode: 'AI',
            },
            _avg: { costMicros: true },
         }),
      ])
      const count = (state: string) => decided.find(each => each.state === state)?._count ?? 0

      return {
         waiting,
         approved: count('APPROVED'),
         rejected: count('REJECTED'),
         edited: Number(edited[0]?.count ?? 0),
         averageCostMicros: Math.round(cost._avg.costMicros ?? 0),
      }
   }

   // What an edit is checked against: the words the owner avoids and the last words of the same kind.
   public static async rules(userId: string, kind: DraftKind) {
      const db = PrismaService.client
      const [voices, recent] = await Promise.all([
         db.writingVoice.findMany({
            where: { userId },
            select: { avoid: true },
         }),
         db.draft.findMany({
            where: {
               userId,
               kind,
               state: { in: ['APPROVED', 'DRAFTED'] },
               words: { not: null },
            },
            orderBy: { draftedAt: 'desc' },
            take: RECENT,
            select: { words: true },
         }),
      ])

      return {
         avoid: [...new Set(voices.flatMap(({ avoid }) => avoid))],
         recent: recent.flatMap(({ words }) => (words ? [words] : [])),
      }
   }

   // Approves the waiting drafts; an edited text must pass every check again. Never acts: the job starts the workflow later.
   public static async approve(userId: string, edits: Array<{ id: string; words?: string }>, now = new Date()) {
      const db = PrismaService.client
      const approved: string[] = []
      const refused: Array<{ id: string; reason: string }> = []

      for (const { id, words } of edits) {
         const draft = await db.draft.findFirst({
            where: {
               id,
               userId,
               state: 'DRAFTED',
               expiresAt: { gt: now },
               clearedAt: null,
            },
            select: {
               kind: true,
               words: true,
               maxChars: true,
            },
         })

         if (!draft) {
            refused.push({
               id,
               reason: 'It is no longer waiting.',
            })

            continue
         }

         const final = words?.trim() || draft.words || ''
         const { avoid, recent } =
            words === undefined
               ? {
                    avoid: [],
                    recent: undefined,
                 }
               : await this.rules(userId, draft.kind)
         const failed = checkWords({
            text: final,
            maxChars: draft.maxChars,
            avoid,
            recent: recent?.filter(text => text !== draft.words),
         }).find(({ ok }) => !ok)

         if (failed) {
            refused.push({
               id,
               reason: failed.label,
            })

            continue
         }

         const { count } = await db.draft.updateMany({
            where: {
               id,
               userId,
               state: 'DRAFTED',
            },
            data: {
               state: 'APPROVED',
               words: final,
               decidedAt: now,
               expiresAt: new Date(now.getTime() + DRAFT_LIMITS.actHours * HOUR_MS),
            },
         })

         if (count === 1) {
            approved.push(id)
         }
      }

      return {
         approved,
         refused,
      }
   }

   public static async reject(
      userId: string,
      ids: string[],
      rejectReason: 'OFF_TOPIC' | 'TOO_GENERIC' | 'WRONG_TONE' | 'SENSITIVE' | 'OTHER',
      now = new Date()
   ) {
      const { count } = await PrismaService.client.draft.updateMany({
         where: {
            id: { in: ids },
            userId,
            state: 'DRAFTED',
         },
         data: {
            state: 'REJECTED',
            rejectReason,
            decidedAt: now,
         },
      })

      return count
   }

   // The approved drafts no run has taken yet, oldest decision first, for the job that starts the runs.
   public static approvedToStart(limit = 500) {
      return PrismaService.client.draft.findMany({
         where: {
            state: 'APPROVED',
            startedRunId: null,
            clearedAt: null,
         },
         orderBy: { decidedAt: 'asc' },
         take: limit,
         select: {
            id: true,
            userId: true,
            kind: true,
            originWorkflowId: true,
            decidedAt: true,
         },
      })
   }

   // Writes the run on the drafts it took; a draft with a run is never started again.
   public static async markStarted(ids: string[], runId: string, now = new Date()) {
      await PrismaService.client.draft.updateMany({
         where: {
            id: { in: ids },
            startedRunId: null,
         },
         data: {
            startedRunId: runId,
            startedAt: now,
         },
      })
   }

   // The items a run started by an approval works on: each draft's item with its final words, rebuilt from the drafts by id.
   public static async itemsOf(userId: string, ids: string[]) {
      const rows = await PrismaService.client.draft.findMany({
         where: {
            id: { in: ids },
            userId,
            state: 'APPROVED',
            clearedAt: null,
         },
         orderBy: { decidedAt: 'asc' },
         select: {
            id: true,
            item: true,
            words: true,
            mode: true,
         },
      })

      return rows.flatMap(({ item, words, mode }) =>
         item && words
            ? [
                 {
                    item,
                    words,
                    mode,
                 },
              ]
            : []
      )
   }

   // Ends what is overdue or outdated, and clears the text of what is old. The row, the counts and the cost stay.
   public static async sweep(now = new Date()) {
      const db = PrismaService.client
      const expired = await db.draft.updateMany({
         where: {
            state: { in: ['DRAFTED', 'APPROVED'] },
            startedRunId: null,
            expiresAt: { lt: now },
         },
         data: {
            state: 'EXPIRED',
            reason: DRAFT_REASONS.NOT_STARTED,
         },
      })
      const accepted = await db.$executeRaw`
         UPDATE "Draft" d SET "state" = 'CANCELLED', "reason" = ${DRAFT_REASONS.ACCEPTED}
         WHERE d."kind" = 'COMMENT' AND d."state" IN ('DRAFTED', 'APPROVED') AND d."startedRunId" IS NULL
           AND EXISTS (
              SELECT 1 FROM "LinkedInInvite" i
              WHERE i."userId" = d."userId" AND i."slug" = d."slug" AND i."acceptedAt" IS NOT NULL AND i."acceptedAt" >= d."draftedAt")`
      const cleared = await db.draft.updateMany({
         where: {
            clearedAt: null,
            draftedAt: { lt: new Date(now.getTime() - DRAFT_LIMITS.retentionDays * DAY_MS) },
         },
         data: {
            item: Prisma.DbNull,
            card: Prisma.DbNull,
            words: null,
            originalWords: null,
            clearedAt: now,
         },
      })

      return {
         expired: expired.count,
         cancelled: accepted,
         cleared: cleared.count,
      }
   }
}
