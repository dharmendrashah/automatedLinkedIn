import { type PersonItem, type WorkflowItemData, mergeBySlug, readItem } from 'core'
import { ELSE_SUFFIX } from 'core/workflowInput'

import { type Prisma, type WorkflowRunStatus, type WorkflowStepStatus } from 'generated/prisma/client'

import { PrismaService } from './prisma.service'

// What the engine in the brain worker reads and writes while it runs a workflow. Every write is safe to repeat, so
// a step cut off by a crash can simply run again.

// A step held longer than this by a worker that stopped is taken again.
export const STALE_CLAIM_MS = 15 * 60 * 1000

const monthOf = (date: Date) => date.toISOString().slice(0, 7)

// Ends the transaction of `retryStep` without changing anything.
class NoRetry extends Error {}

const json = (item: WorkflowItemData): Prisma.InputJsonValue => item

export type CallOutcome = {
   status: 'DONE' | 'FAILED'
   rows: number
   costMicros: number
   error: string | null
}

// Where a step's output lives: its block, and which round of a loop or For each batch.
export type ItemKey = { runId: string; nodeId: string; round: number }

export type StepProgress = {
   requests: number
   done: number
   failed: number
   // Failed without a charge.
   uncharged: number
   retrying: number
   nextRetryAt: Date | null
}

const whereKey = ({ runId, nodeId, round }: ItemKey, slug: string) => ({
   runId_nodeId_round_slug: {
      runId,
      nodeId,
      round,
      slug,
   },
})

const rowOf = (at: ItemKey, item: WorkflowItemData, keepUntil: Date | null = null) => ({
   ...at,
   slug: item.slug,
   data: json(item),
   keepUntil,
})

const readAll = (rows: { data: unknown }[]) =>
   rows.flatMap(({ data }) => {
      const item = readItem(data)

      return item ? [item] : []
   })

export class WorkflowRunService {
   public static async activeRunIds() {
      const runs = await PrismaService.client.workflowRun.findMany({
         where: { status: 'RUNNING' },
         orderBy: { startedAt: 'asc' },
         select: { id: true },
      })

      return runs.map(({ id }) => id)
   }

   public static load(runId: string) {
      return PrismaService.client.workflowRun.findUnique({
         where: { id: runId },
         include: {
            steps: true,
            workflow: { select: { outputListId: true } },
         },
      })
   }

   // True when this worker now owns the step: it was waiting, or its owner stopped long ago.
   public static async claim(stepId: string) {
      const { count } = await PrismaService.client.workflowStepRun.updateMany({
         where: {
            id: stepId,
            OR: [
               { status: 'WAITING' },
               {
                  status: 'RUNNING',
                  claimedAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) },
               },
            ],
         },
         data: {
            status: 'RUNNING',
            claimedAt: new Date(),
         },
      })

      return count === 1
   }

   public static finishStep(
      stepId: string,
      result: {
         status: WorkflowStepStatus
         itemsIn: number
         itemsOut: number
         message?: string | null
         errorCode?: string | null
      }
   ) {
      return PrismaService.client.workflowStepRun.update({
         where: { id: stepId },
         data: {
            ...result,
            finishedAt: new Date(),
         },
      })
   }

   public static async items(runId: string, sources: { nodeId: string; round: number }[]) {
      if (sources.length === 0) {
         return []
      }

      const rows = await PrismaService.client.workflowItem.findMany({
         where: {
            runId,
            OR: sources,
         },
         orderBy: { slug: 'asc' },
         select: { data: true },
      })

      return readAll(rows)
   }

   // One page of what a step passed on, for the owner to look at. All rounds unless one is asked for.
   public static async page(runId: string, nodeId: string, round: number | undefined, skip: number, take: number) {
      const where = {
         runId,
         nodeId,
         ...(round === undefined ? {} : { round }),
      }
      const [rows, total] = await Promise.all([
         PrismaService.client.workflowItem.findMany({
            where,
            orderBy: [{ round: 'asc' }, { slug: 'asc' }],
            skip,
            take,
            select: {
               round: true,
               data: true,
            },
         }),
         PrismaService.client.workflowItem.count({ where }),
      ])

      return {
         total,
         items: rows.flatMap(({ round: itemRound, data }) => {
            const item = readItem(data)

            return item
               ? [
                    {
                       round: itemRound,
                       item,
                    },
                 ]
               : []
         }),
      }
   }

   // One page of what several places hold (what reached a block), with the block each item came from.
   public static async pageKeys(runId: string, keys: { nodeId: string; round: number }[], skip: number, take: number) {
      if (keys.length === 0) {
         return {
            total: 0,
            items: [],
         }
      }

      const where = {
         runId,
         OR: keys,
      }
      const [rows, total] = await Promise.all([
         PrismaService.client.workflowItem.findMany({
            where,
            orderBy: [{ nodeId: 'asc' }, { round: 'asc' }, { slug: 'asc' }],
            skip,
            take,
            select: {
               nodeId: true,
               round: true,
               data: true,
            },
         }),
         PrismaService.client.workflowItem.count({ where }),
      ])

      return {
         total,
         items: rows.flatMap(({ nodeId, round, data }) => {
            const item = readItem(data)

            return item
               ? [
                    {
                       round,
                       from: nodeId.replace(ELSE_SUFFIX, ''),
                       item,
                    },
                 ]
               : []
         }),
      }
   }

   // Replaces what a step produced, so running the step again gives the same result.
   public static replaceItems(at: ItemKey, items: WorkflowItemData[], keepUntil: Date | null = null) {
      return PrismaService.client.$transaction([
         PrismaService.client.workflowItem.deleteMany({ where: at }),
         PrismaService.client.workflowItem.createMany({
            data: items.map(item => rowOf(at, item, keepUntil)),
            skipDuplicates: true,
         }),
      ])
   }

   // Adds people to a collect step's output, merging anyone it already holds.
   public static mergePeople(at: ItemKey, people: PersonItem[]) {
      return PrismaService.client.$transaction(async tx => {
         const incoming = mergeBySlug(people)
         const known = await tx.workflowItem.findMany({
            where: {
               ...at,
               slug: { in: incoming.map(({ slug }) => slug) },
            },
            select: { data: true },
         })
         const merged = mergeBySlug([
            ...readAll(known).filter((item): item is PersonItem => item.kind === 'profile'),
            ...incoming,
         ])

         for (const item of merged) {
            await tx.workflowItem.upsert({
               where: whereKey(at, item.slug),
               create: rowOf(at, item),
               update: { data: json(item) },
            })
         }
      })
   }

   // Writes items that are not there yet and leaves the rest, so a resumed step keeps its progress.
   public static seedItems(at: ItemKey, items: WorkflowItemData[]) {
      return PrismaService.client.workflowItem.createMany({
         data: items.map(item => rowOf(at, item)),
         skipDuplicates: true,
      })
   }

   // Overwrites these items of a step.
   public static putItems(at: ItemKey, items: WorkflowItemData[]) {
      return PrismaService.client.$transaction(
         items.map(item =>
            PrismaService.client.workflowItem.upsert({
               where: whereKey(at, item.slug),
               create: rowOf(at, item),
               update: { data: json(item) },
            })
         )
      )
   }

   // Gives a step back when the worker has to stop; its finished requests are kept and skipped next time.
   public static release(stepId: string) {
      return PrismaService.client.workflowStepRun.updateMany({
         where: {
            id: stepId,
            status: 'RUNNING',
         },
         data: {
            status: 'WAITING',
            claimedAt: null,
         },
      })
   }

   public static async countItems(at: ItemKey) {
      return PrismaService.client.workflowItem.count({ where: at })
   }

   public static async idOfKey(runKey: string) {
      const run = await PrismaService.client.workflowRun.findUnique({
         where: { runKey },
         select: { id: true },
      })

      return run?.id ?? null
   }

   public static setChildRun(stepId: string, childRunId: string) {
      return PrismaService.client.workflowStepRun.update({
         where: { id: stepId },
         data: { childRunId },
      })
   }

   // What a step that is still waiting says about itself, shown in the run's Note column; null clears it.
   public static setNote(stepId: string, message: string | null) {
      return PrismaService.client.workflowStepRun.update({
         where: { id: stepId },
         data: { message },
      })
   }

   // The first time a worker took the step; later takes leave it as it is.
   public static markStarted(stepId: string, at: Date) {
      return PrismaService.client.workflowStepRun.updateMany({
         where: {
            id: stepId,
            startedAt: null,
         },
         data: { startedAt: at },
      })
   }

   // The step is not started before this time (a Wait, or the pause before a retry).
   public static setWaitUntil(stepId: string, waitUntil: Date) {
      return PrismaService.client.workflowStepRun.update({
         where: { id: stepId },
         data: { waitUntil },
      })
   }

   // Gives a step another try (.plan/logic-wait-result-retry.md): its requests that failed without a charge are opened again,
   // the ones that went through stay done, and the step goes back to waiting, after the pause when there is one. False when it
   // has no tries left or, with `needsReopened`, when no request could be opened again. A charged request is never opened again.
   public static async retryStep(
      stepId: string,
      retry: { max: number; waitSeconds: number; needsReopened: boolean }
   ): Promise<boolean> {
      try {
         return await PrismaService.client.$transaction(async tx => {
            const { count } = await tx.workflowStepRun.updateMany({
               where: {
                  id: stepId,
                  tries: { lt: retry.max },
               },
               data: {
                  status: 'WAITING',
                  claimedAt: null,
                  finishedAt: null,
                  message: null,
                  errorCode: null,
                  tries: { increment: 1 },
                  waitUntil: retry.waitSeconds > 0 ? new Date(Date.now() + retry.waitSeconds * 1000) : null,
               },
            })
            const reopened = await tx.workflowStepCall.updateMany({
               where: {
                  stepRunId: stepId,
                  status: 'FAILED',
                  costMicros: 0,
                  finishedAt: { not: null },
               },
               data: {
                  status: 'STARTED',
                  finishedAt: null,
                  error: null,
                  jobId: null,
                  sentAt: null,
                  retryAt: null,
                  attempts: 0,
                  rows: 0,
               },
            })

            if (count === 0 || (retry.needsReopened && reopened.count === 0)) {
               throw new NoRetry()
            }

            return true
         })
      } catch (error) {
         if (error instanceof NoRetry) {
            return false
         }

         throw error
      }
   }

   // Where a run started by a "Run another workflow" block stands. null when it was deleted.
   public static child(runId: string) {
      return PrismaService.client.workflowRun.findUnique({
         where: { id: runId },
         select: {
            status: true,
            message: true,
            startedAt: true,
            workflow: { select: { name: true } },
         },
      })
   }

   // Everyone a run's "Add to list" blocks got, once.
   public static async listedPeople(runId: string) {
      const steps = await PrismaService.client.workflowStepRun.findMany({
         where: {
            runId,
            type: 'output.list',
         },
         select: {
            nodeId: true,
            round: true,
         },
      })
      const items = await WorkflowRunService.items(runId, steps)

      return mergeBySlug(items.filter((item): item is PersonItem => item.kind === 'profile'))
   }

   // Steps for the next round of a loop or For each; repeating it creates nothing twice.
   public static addRound(runId: string, steps: { nodeId: string; type: string }[], round: number) {
      return PrismaService.client.workflowStepRun.createMany({
         data: steps.map(step => ({
            runId,
            ...step,
            round,
         })),
         skipDuplicates: true,
      })
   }

   // The record of one paid request, created before the request is sent.
   public static call(stepRunId: string, inputKey: string) {
      return PrismaService.client.workflowStepCall.upsert({
         where: {
            stepRunId_inputKey: {
               stepRunId,
               inputKey,
            },
         },
         create: {
            stepRunId,
            inputKey,
         },
         update: {},
      })
   }

   public static saveJobId(callId: string, jobId: string) {
      return PrismaService.client.workflowStepCall.update({
         where: { id: callId },
         data: { jobId },
      })
   }

   // How many requests of a step the data service refused as invalid (a retry cannot fix them).
   public static refusedCalls(stepRunId: string) {
      return PrismaService.client.workflowStepCall.count({
         where: {
            stepRunId,
            status: 'FAILED',
            error: 'BAD_REQUEST',
         },
      })
   }

   // Where each step's paid requests stand: done, failed (and how many of those cost nothing), and waiting to retry.
   public static async progress(runId: string, now = new Date()) {
      const calls = await PrismaService.client.workflowStepCall.findMany({
         where: { stepRun: { runId } },
         select: {
            stepRunId: true,
            status: true,
            costMicros: true,
            finishedAt: true,
            retryAt: true,
         },
      })
      const byStep = new Map<string, StepProgress>()

      for (const call of calls) {
         const step = byStep.get(call.stepRunId) ?? {
            requests: 0,
            done: 0,
            failed: 0,
            uncharged: 0,
            retrying: 0,
            nextRetryAt: null,
         }
         const failed = call.finishedAt !== null && call.status === 'FAILED'
         const retrying = call.finishedAt === null && call.retryAt !== null && call.retryAt > now

         step.requests += 1
         step.done += call.finishedAt ? 1 : 0
         step.failed += failed ? 1 : 0
         step.uncharged += failed && call.costMicros === 0 ? 1 : 0
         step.retrying += retrying ? 1 : 0

         if (retrying && call.retryAt && (!step.nextRetryAt || call.retryAt < step.nextRetryAt)) {
            step.nextRetryAt = call.retryAt
         }

         byStep.set(call.stepRunId, step)
      }

      return byStep
   }

   public static markSent(callId: string) {
      return PrismaService.client.workflowStepCall.update({
         where: { id: callId },
         data: { sentAt: new Date() },
      })
   }

   // A request that failed without a charge is sent again at `at`; `restart` drops the failed job.
   public static retryCall(callId: string, retry: { at: Date; restart: boolean; error: string }) {
      return PrismaService.client.workflowStepCall.update({
         where: { id: callId },
         data: {
            attempts: { increment: 1 },
            retryAt: retry.at,
            error: retry.error.slice(0, 300),
            ...(retry.restart
               ? {
                    jobId: null,
                    sentAt: null,
                 }
               : {}),
         },
      })
   }

   // Ends a request and books what it cost to the client's month, once.
   public static finishCall(
      callId: string,
      outcome: CallOutcome,
      booking: { userId: string; workflowId: string; runId: string; stepId: string }
   ) {
      return PrismaService.client.$transaction(async tx => {
         const { count } = await tx.workflowStepCall.updateMany({
            where: {
               id: callId,
               finishedAt: null,
            },
            data: {
               ...outcome,
               finishedAt: new Date(),
            },
         })

         if (count === 0 || outcome.costMicros === 0) {
            return
         }

         await tx.spendLedger.create({
            data: {
               userId: booking.userId,
               workflowId: booking.workflowId,
               runId: booking.runId,
               callId,
               amountMicros: outcome.costMicros,
               month: monthOf(new Date()),
            },
         })
         await tx.workflowStepRun.update({
            where: { id: booking.stepId },
            data: { costMicros: { increment: outcome.costMicros } },
         })
         await tx.workflowRun.update({
            where: { id: booking.runId },
            data: { costMicros: { increment: outcome.costMicros } },
         })
      })
   }

   public static setBands(runId: string, bands: { qualified: number; maybe: number }) {
      return PrismaService.client.workflowRun.update({
         where: { id: runId },
         data: bands,
      })
   }

   public static finishRun(runId: string, result: { status: WorkflowRunStatus; discarded: number; message?: string }) {
      return PrismaService.client.workflowRun.updateMany({
         where: {
            id: runId,
            status: 'RUNNING',
         },
         data: {
            ...result,
            finishedAt: new Date(),
         },
      })
   }
}
