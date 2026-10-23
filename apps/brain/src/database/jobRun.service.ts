import { randomUUID } from 'node:crypto'

import { type Prisma } from 'generated/prisma/client'

import { cleanError } from './jobHealth'
import { PrismaService } from './prisma.service'

export type JobRunOutcome = 'WORKED' | 'IDLE' | 'FAILED' | 'TIMED_OUT'

// What a run handled: one account and what was done or why it was left. Ids and fixed sentences only.
export type JobItemInput = {
   userId?: string
   accountId?: string
   action: string
   result: 'ASKED' | 'SKIPPED' | 'FAILED'
   reason?: string
   sessionId?: string
}

export type JobRunInput = {
   job: string
   startedAt: Date
   finishedAt: Date
   outcome: JobRunOutcome
   summary?: string
   counts?: Record<string, number>
   error?: unknown
   items?: JobItemInput[]
}

export type JobDefinitionInput = {
   name: string
   title: string
   purpose: string
   everyMs: number
   timeoutMs: number
}

// Keeps one run from filling the table; the rest is counted.
export const MAX_ITEMS_PER_RUN = 500

export const JOB_RUN_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

export class JobRunService {
   // Saves finished runs in one go; the worker batches them so a 5 second job does not cost an insert a tick.
   public static async recordMany(runs: JobRunInput[], where: { instance: string; build: string }) {
      if (runs.length === 0) {
         return
      }

      const db = PrismaService.client
      const runRows: Prisma.JobRunCreateManyInput[] = []
      const itemRows: Prisma.JobRunItemCreateManyInput[] = []

      for (const run of runs) {
         const id = randomUUID()
         const kept = run.items?.slice(0, MAX_ITEMS_PER_RUN) ?? []
         const dropped = (run.items?.length ?? 0) - kept.length
         const counts =
            dropped > 0
               ? {
                    ...run.counts,
                    itemsNotKept: dropped,
                 }
               : run.counts

         runRows.push({
            id,
            job: run.job,
            startedAt: run.startedAt,
            finishedAt: run.finishedAt,
            durationMs: Math.max(0, run.finishedAt.getTime() - run.startedAt.getTime()),
            outcome: run.outcome,
            summary: run.summary,
            counts,
            error: run.error === undefined ? undefined : cleanError(run.error),
            instance: where.instance,
            build: where.build,
         })
         itemRows.push(
            ...kept.map(item => ({
               ...item,
               runId: id,
            }))
         )
      }

      await db.$transaction([db.jobRun.createMany({ data: runRows }), db.jobRunItem.createMany({ data: itemRows })])
   }

   // What the worker says its jobs are; a job that left the registry is dropped.
   public static async announce(definitions: JobDefinitionInput[]) {
      const db = PrismaService.client

      await db.$transaction([
         db.jobDefinition.deleteMany({ where: { name: { notIn: definitions.map(({ name }) => name) } } }),
         ...definitions.map(({ name, ...rest }) =>
            db.jobDefinition.upsert({
               where: { name },
               create: {
                  name,
                  ...rest,
               },
               update: {
                  ...rest,
                  seenAt: new Date(),
               },
            })
         ),
      ])
   }

   public static async cleanup(now = new Date()) {
      const cutoff = new Date(now.getTime() - JOB_RUN_DAYS * DAY_MS)
      const { count } = await PrismaService.client.jobRun.deleteMany({ where: { startedAt: { lt: cutoff } } })

      return count
   }
}
